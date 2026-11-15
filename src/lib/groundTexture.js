// The ground of the 3D view, in pieces (see capMaterial.js, which combines them on the GPU): the base (LRO photograph + light
// relief shading, painted once), the layers (sunlight and shadows, Earth visibility, forbidden zones, "Optimal", "Feasible"; one
// small picture per step of the timeline), the same layers at the resolution of the loaded 500 m chunks, and the graticule with the
// candidate region squares (painted once). A fine zone around a site (100 to 250 m cells, see zones.js) has its own canvas, painted
// by paintZone, and is shown in place of the overview when zoomed in.
import { FINE_SAMPLES, feasibilityOverlay, levelsAt, prepareFeasibility, visibilityKey } from './feasibility.js'
import { goFractionOverlay, goFractions, goOverlay, visibilityOverlay } from './illumination.js'
import { slopeOverlayRgba } from './terrain3d.js'
import { zoneRect } from './zones.js'

export const TEXTURE_SIZE = 2048
/**
 * How the layers sit on the ground: see-through over the photograph, the rim of the cap fades into the Moon around it, and the hillshade
 * is laid over the photograph as a light relief shading (its strength is that of reliefShading; the relief setting of the 2D map multiplies it).
 */
export function groundLook(photo) {
  return photo ? { layerAlpha: 0.55, edgeFade: 0.05, reliefShading: 0.3 } : { layerAlpha: 1, edgeFade: 0.0001, reliefShading: 0 }
}

// The share-of-period map does not depend on the moment shown: keep it per terrain instead of recomputing at every step.
const periodCache = new WeakMap()
function periodFractions(terrain, frames, samples, options) {
  const key = `${options.minSunDeg}|${options.minEarthDeg}|${options.maxSlopeDeg}`
  const cached = periodCache.get(terrain)
  if (cached && cached.samples === samples && cached.key === key) return cached.fractions
  const fractions = goFractions(terrain, frames, samples, options)
  periodCache.set(terrain, { samples, key, fractions })
  return fractions
}

// The visibility bits of the cells over the range, for the fine chunks and zones (the 2.4 km map comes in from useFeasibility, sliced), kept
// per chunk: the verdict for the moment shown is then a few bit operations per cell (feasibility.js).
const feasibilityCache = new WeakMap()
function cachedFeasibility(terrain, frames, samples, requirements) {
  const key = visibilityKey(requirements)
  let cached = feasibilityCache.get(terrain)
  if (!cached || cached.samples !== samples || cached.key !== key) {
    cached = { samples, key, prep: prepareFeasibility(terrain, frames, samples, requirements, FINE_SAMPLES) }
    feasibilityCache.set(terrain, cached)
  }
  return cached.prep
}

/**
 * The RGBA layers (grid x grid each) to paint, bottom first, for a terrain (the whole map or a zone).
 * `feasibleLevels`: for the 2.4 km map, the levels for the moment shown (null while they are being prepared); other terrains leave it
 * out and get theirs computed here, for the sample `index` of `samples`.
 */
function layerPixels({ terrain, frames, sample, samples, index, layers, requirements, feasibleLevels }) {
  const out = []
  if (layers.go && sample && frames) {
    const options = { minSunDeg: requirements.minSunDeg, minEarthDeg: requirements.minEarthDeg, maxSlopeDeg: requirements.maxSlopeDeg }
    out.push(
      layers.goPeriod && samples
        ? goFractionOverlay(terrain, frames, periodFractions(terrain, frames, samples, options))
        : goOverlay(terrain, frames, sample, options),
    )
  } else if (layers.feasible && samples && frames) {
    const levels = feasibleLevels !== undefined ? feasibleLevels : levelsAt(terrain, frames, cachedFeasibility(terrain, frames, samples, requirements), requirements, index ?? 0)
    if (levels) out.push(feasibilityOverlay(terrain, frames, levels))
  } else if ((layers.sun || layers.earth) && sample && frames) {
    out.push(
      visibilityOverlay(terrain, frames, sample, {
        sun: layers.sun,
        earth: layers.earth,
        minSunDeg: requirements.minSunDeg,
        minEarthDeg: requirements.minEarthDeg,
      }),
    )
  }
  if (layers.slope && !layers.go && !layers.feasible) out.push(slopeOverlayRgba(terrain, requirements.maxSlopeDeg))
  return out
}

/**
 * Paints the base of the whole map (TEXTURE_SIZE square canvas): the photograph, or, without it, the hillshade alone. Done once (and again if the pictures arrive later), not at every step.
 */
export function paintBase(canvas, { hillshade, photo }) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  if (!photo) {
    ctx.drawImage(hillshade, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
    return
  }
  ctx.drawImage(photo, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE) // the hillshade is laid over it by the cap's shader, so its strength can change
}

// Straight (not premultiplied) RGBA of several layers laid one over the other, bottom first.
function stackLayers(list, grid) {
  if (list.length === 1) return list[0]
  const out = new Uint8ClampedArray(grid * grid * 4)
  for (let i = 0; i < out.length; i += 4) {
    let r = 0
    let g = 0
    let b = 0
    let a = 0 // 0..1
    for (const layer of list) {
      const la = layer[i + 3] / 255
      if (la === 0) continue
      const outA = la + a * (1 - la)
      r = (layer[i] * la + r * a * (1 - la)) / outA
      g = (layer[i + 1] * la + g * a * (1 - la)) / outA
      b = (layer[i + 2] * la + b * a * (1 - la)) / outA
      a = outA
    }
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = a * 255
  }
  return out
}

/**
 * Which layers of the 2.4 km map are computed by the GPU for the moment shown (`live`: 'go', 'vis' or null) and which come from
 * pictures that are not computed by the GPU (`main`: 'period' (Optimal over the period) or 'feasible' (for the moment shown, by the CPU) or null; `slope`: the
 * forbidden zones). The same precedence as layerPixels: Optimal, else Feasible, else Sun / Earth, with the slope on top of the
 * last two.
 */
export function layerPlan({ frames, sample, samples, layers }) {
  const slope = !!layers.slope && !layers.go && !layers.feasible
  if (layers.go && sample && frames) return { live: layers.goPeriod && samples ? null : 'go', main: layers.goPeriod && samples ? 'period' : null, slope }
  if (layers.feasible && samples && frames) return { live: null, main: 'feasible', slope }
  if ((layers.sun || layers.earth) && sample && frames) return { live: 'vis', main: null, slope }
  return { live: null, main: null, slope }
}

function premultiplied(rgba) {
  const out = new Uint8Array(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]
    out[i] = Math.round((rgba[i] * a) / 255)
    out[i + 1] = Math.round((rgba[i + 1] * a) / 255)
    out[i + 2] = Math.round((rgba[i + 2] * a) / 255)
    out[i + 3] = a
  }
  return out
}

/**
 * The layers of the 2.4 km cells that do not depend on the moment, as premultiplied RGBA pictures for the GPU (grid x grid, rows
 * from the top of the map): { main, slope }, each null when not shown (see layerPlan). Only worth recomputing when the period,
 * the layers or the requirements change.
 *   terrain, frames: see loadTerrain3d and buildCellFrames;  samples: all the sky samples of the period;
 *   feasibleLevels: the verdict codes of the 2.4 km cells (useFeasibility; null while computing).
 */
export function staticLayers({ terrain, frames, sample, samples, layers, requirements, feasibleLevels }) {
  const plan = layerPlan({ frames, sample, samples, layers })
  let main = null
  if (plan.main === 'period') {
    const options = { minSunDeg: requirements.minSunDeg, minEarthDeg: requirements.minEarthDeg, maxSlopeDeg: requirements.maxSlopeDeg }
    main = premultiplied(goFractionOverlay(terrain, frames, periodFractions(terrain, frames, samples, options)))
  } else if (plan.main === 'feasible' && feasibleLevels) {
    main = premultiplied(feasibilityOverlay(terrain, frames, feasibleLevels))
  }
  return { main, slope: plan.slope ? premultiplied(slopeOverlayRgba(terrain, requirements.maxSlopeDeg)) : null }
}

let scratch = null
/**
 * Paints the layers of the loaded 500 m chunks (fineGrid.js) on `canvas` (TEXTURE_SIZE square), each at its own resolution. Inside
 * a chunk the alpha is 0.5 + layer alpha / 2 (see capMaterial.js); elsewhere it is 0. Returns false (and leaves the canvas
 * empty) when there is nothing to draw: no chunk, or no layer shown.
 */
export function paintFine(canvas, { fine, sample, samples, index, layers, requirements }) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  let drawn = false
  ctx.imageSmoothingEnabled = false
  for (const chunk of fine) {
    const list = layerPixels({ terrain: chunk, frames: chunk.frames, sample, samples, index, layers, requirements })
    if (list.length === 0) break // no layer shown: none for the other chunks either
    const rgba = stackLayers(list, chunk.grid)
    const coded = new Uint8ClampedArray(rgba.length)
    for (let i = 0; i < rgba.length; i += 4) {
      coded[i] = rgba[i]
      coded[i + 1] = rgba[i + 1]
      coded[i + 2] = rgba[i + 2]
      coded[i + 3] = 128 + (rgba[i + 3] >> 1)
    }
    if (!scratch || scratch.width !== chunk.grid) {
      scratch = document.createElement('canvas')
      scratch.width = scratch.height = chunk.grid
    }
    scratch.getContext('2d').putImageData(new ImageData(coded, chunk.grid, chunk.grid), 0, 0)
    const r = zoneRect(chunk)
    ctx.drawImage(scratch, r.x * TEXTURE_SIZE, r.y * TEXTURE_SIZE, r.side * TEXTURE_SIZE, r.side * TEXTURE_SIZE)
    drawn = true
  }
  return drawn
}

/**
 * The layers computed on the cells of a fine zone, for the moment shown, as one picture for the GPU (zoneMaterial.js): premultiplied RGBA
 * (zone.grid squared, rows from the top of the zone), or null when no layer is shown.
 *   zone: see zones.js;  frames: zoneFrames(zone);  the other fields as for staticLayers.
 */
export function zoneLayer({ zone, frames, sample, samples, index, layers, requirements }) {
  const list = layerPixels({ terrain: zone, frames, sample, samples, index, layers, requirements })
  return list.length === 0 ? null : premultiplied(stackLayers(list, zone.grid))
}
