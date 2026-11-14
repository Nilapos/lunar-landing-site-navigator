// The ground textures shared by the 3D view: the hillshade picture, then the layers (sunlight and shadows, Earth
// visibility, forbidden zones, "Optimal"), painted on a canvas. One covers the whole map (2.4 km cells), another covers
// a fine zone around a site (100 to 250 m cells, see zones.js) and is shown in place of the overview when zoomed in.
import { feasibilityLevels, feasibilityKey, feasibilityOverlay } from './feasibility.js'
import { goFractionOverlay, goFractions, goOverlay, visibilityOverlay } from './illumination.js'
import { GRID_LATS, GRID_LONS, circleRadius, projectToMap, regionSquare } from './polarMap.js'
import { slopeOverlayRgba } from './terrain3d.js'
import { zoneRect } from './zones.js'

export const TEXTURE_SIZE = 2048
export const ZONE_TEXTURE_SIZE = 512

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

// The verdict of the cells over the period, for the fine chunks and zones (the 2.4 km map comes in from useFeasibility, sliced).
const feasibilityCache = new WeakMap()
function cachedFeasibility(terrain, frames, samples, requirements) {
  const key = feasibilityKey(requirements)
  const cached = feasibilityCache.get(terrain)
  if (cached && cached.samples === samples && cached.key === key) return cached.levels
  const levels = feasibilityLevels(terrain, frames, samples, requirements)
  feasibilityCache.set(terrain, { samples, key, levels })
  return levels
}

/**
 * The RGBA layers (grid x grid each) to paint, bottom first, for a terrain (the whole map or a zone).
 * `feasibleLevels`: for the 2.4 km map, the levels computed by useFeasibility (null while they are being computed); other
 * terrains leave it out and get theirs computed here.
 */
function layerPixels({ terrain, frames, sample, samples, layers, requirements, feasibleLevels }) {
  const out = []
  if (layers.go && sample && frames) {
    const options = { minSunDeg: requirements.minSunDeg, minEarthDeg: requirements.minEarthDeg, maxSlopeDeg: requirements.maxSlopeDeg }
    out.push(
      layers.goPeriod && samples
        ? goFractionOverlay(terrain, frames, periodFractions(terrain, frames, samples, options))
        : goOverlay(terrain, frames, sample, options),
    )
  } else if (layers.feasible && samples && frames) {
    const levels = feasibleLevels !== undefined ? feasibleLevels : cachedFeasibility(terrain, frames, samples, requirements)
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

function gridCanvas(rgba, grid) {
  const small = document.createElement('canvas')
  small.width = grid
  small.height = grid
  small.getContext('2d').putImageData(new ImageData(rgba, grid, grid), 0, 0)
  return small
}

// Draws a grid-sized RGBA layer onto the whole-map texture, only inside the 80 S disc (the corners hold no data).
function drawLayer(ctx, rgba, grid) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2 - 2, 0, Math.PI * 2)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(gridCanvas(rgba, grid), 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  ctx.restore()
}

/**
 * Repaints `canvas` (TEXTURE_SIZE square), the texture of the whole map.
 *   hillshade: the relief picture; terrain, frames: see loadTerrain3d and buildCellFrames;
 *   sample: one entry of /api/sky (or null: no sunlight / Earth layer);
 *   samples: all the sky samples of the period (for the Optimal layer over the period);
 *   layers: { sun, earth, slope, go, goPeriod }; requirements: { maxSlopeDeg, minSunDeg, minEarthDeg };
 *   overlay (optional): { regions: [{ lat, lon }], colors: { grid, regionFill, regionEdge } }, the graticule and the
 *   candidate region squares in the style of NASA's Artemis III videos, drawn over the layers;
 *   feasibleLevels: for the Feasible layer, the verdict codes of the 2.4 km cells (useFeasibility; null while computing);
 *   fine (optional): the loaded 500 m chunks (fineGrid.js); each is repainted at its own resolution over the overview;
 *   holes (optional): [{ x, y, side }] squares of the map (fractions of its width) left transparent, where a fine zone
 *   takes over.
 */
export function paintGround(canvas, { hillshade, terrain, frames, sample, samples, layers, requirements, overlay, holes = [], fine = [], feasibleLevels }) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  ctx.drawImage(hillshade, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  for (const rgba of layerPixels({ terrain, frames, sample, samples, layers, requirements, feasibleLevels })) drawLayer(ctx, rgba, terrain.grid)
  for (const chunk of fine) {
    const r = zoneRect(chunk)
    const x = r.x * TEXTURE_SIZE
    const y = r.y * TEXTURE_SIZE
    const side = r.side * TEXTURE_SIZE
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, side, side)
    ctx.clip()
    ctx.drawImage(hillshade, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE) // the relief picture again, under this chunk's own cells
    ctx.imageSmoothingEnabled = false
    for (const rgba of layerPixels({ terrain: chunk, frames: chunk.frames, sample, samples, layers, requirements })) ctx.drawImage(gridCanvas(rgba, chunk.grid), x, y, side, side)
    ctx.restore()
  }
  if (overlay) drawOverlay(ctx, overlay)
  for (const h of holes) ctx.clearRect(h.x * TEXTURE_SIZE, h.y * TEXTURE_SIZE, h.side * TEXTURE_SIZE, h.side * TEXTURE_SIZE)
}

/**
 * Repaints `canvas` (ZONE_TEXTURE_SIZE square), the texture of a fine zone: its own hillshade, then the same layers
 * computed on its cells (drawn without smoothing, so each cell stays a visible square).
 *   zone: see zones.js;  frames: zoneFrames(zone);  hillshade: the zone's picture; the other fields as for paintGround.
 */
export function paintZone(canvas, { hillshade, zone, frames, sample, samples, layers, requirements }) {
  const S = ZONE_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, S, S)
  ctx.drawImage(hillshade, 0, 0, S, S)
  ctx.imageSmoothingEnabled = false
  for (const rgba of layerPixels({ terrain: zone, frames, sample, samples, layers, requirements })) ctx.drawImage(gridCanvas(rgba, zone.grid), 0, 0, S, S)
}

// Graticule (thin lines) then one translucent square with a bright edge per candidate region.
function drawOverlay(ctx, { regions, colors }) {
  const S = TEXTURE_SIZE
  ctx.save()
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = (3 * S) / 1024 // the texture is seen reduced: thinner lines vanish
  ctx.beginPath()
  for (const lat of GRID_LATS) {
    ctx.moveTo(S / 2 + circleRadius(lat) * S, S / 2)
    ctx.arc(S / 2, S / 2, circleRadius(lat) * S, 0, Math.PI * 2)
  }
  for (const lon of GRID_LONS) {
    const edge = projectToMap(-80, lon)
    ctx.moveTo(S / 2, S / 2)
    ctx.lineTo(edge.x * S, edge.y * S)
  }
  ctx.stroke()
  ctx.fillStyle = colors.regionFill
  ctx.strokeStyle = colors.regionEdge
  ctx.lineWidth = (3 * S) / 1024
  for (const r of regions) {
    const sq = regionSquare(r.lat, r.lon)
    ctx.fillRect(sq.x * S, sq.y * S, sq.side * S, sq.side * S)
    ctx.strokeRect(sq.x * S, sq.y * S, sq.side * S, sq.side * S)
  }
  ctx.restore()
}
