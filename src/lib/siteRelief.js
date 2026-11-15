// The ground of the "On site" view: the real relief around a standing observer, as a mesh, with the sunlight on it.
// No 3D library here, so it can be tested; siteGround.js and polarSkyScene.js draw it.
//
// The mesh is polar, centered on the observer: RELIEF_AZIMUTHS directions (one per degree, like the horizon profile of the site)
// by rings whose radius grows by 15% from 0.7 m to 220 km, so the ground is fine under the feet and coarse far away. Each vertex
// sits on the real sphere plus the LOLA height of the finest grid that covers it (sources, coarse to fine: the 2.4 km overview,
// the 500 m chunks, the 125 m zone of the site), blended over a few cells where a finer grid ends.
//
// Two rules keep the picture honest:
//   - the skyline is the one of the analysis: in every direction the highest point of the mesh is moved to the terrain horizon of
//     the site (its 360-value profile, from the 80 m map), so the Sun and the Earth pass above or behind the same skyline as in
//     the scores. Coarser grids smooth summits; the correction is spread over the ground before the ridge;
//   - the sunlight comes from the same data as the map layers: each vertex takes the Sun's height above the terrain horizon of the
//     grid cells around it (horizons traced on the LOLA map, see horizonGrid.js), and near the observer the horizon of the site.
//
// The triangles are listed far to near, so the mesh can be drawn without a depth test (each ring covers what is behind it: a
// height field seen from its center). A depth buffer cannot tell 100 km from 101 km when the nearest ground is 2 m away.
import { sunMargin } from './illumination.js'
import { MAP_RADIUS_KM } from './polarMap.js'
import { edgeTaper, MOON_RADIUS_KM } from './polarSky.js'
import { localFrame } from './sky.js'

const DEG = 180 / Math.PI
const R = MOON_RADIUS_KM

export const RELIEF_AZIMUTHS = 360
export const EYE_M = 2 // the observer's eyes are 2 m above the ground
const RING_MIN_M = 0.7
const RING_MAX_M = 220000
const RING_RATIO = 1.15
const FEATHER_CELLS = 3 // a finer grid fades into the coarser one over this many cells at its edge
const WARP_FROM_M = 30 // the skyline correction starts this far from the observer...
const WARP_FULL_M = 1000 // ...and is whole from here on
const SITE_LIGHT_FULL_M = 60 // nearer than this the sunlight is the one of the site itself (its own horizon)
const SITE_LIGHT_NONE_M = 800 // farther than this it is the one of the grid cells
const NO_SOURCE = 255

const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Radii (m) of the rings, nearest first. */
export function reliefRadii(minM = RING_MIN_M, maxM = RING_MAX_M, ratio = RING_RATIO) {
  const out = []
  for (let r = minM; r < maxM; r *= ratio) out.push(r)
  out.push(maxM)
  return out
}

/** 0 at the edge of the valid cells, 1 from FEATHER_CELLS cells inside: how much a grid counts over the coarser one under it. */
function featherWeights(valid, cols, rows, reach = FEATHER_CELLS) {
  const d = new Uint8Array(cols * rows)
  const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? 0 : valid[j * cols + i])
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!valid[j * cols + i]) continue
      const border = !at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1)
      d[j * cols + i] = border ? 1 : 255
    }
  }
  for (let step = 2; step <= reach; step++) {
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const c = j * cols + i
        if (d[c] !== 255) continue
        if (d[c - 1] === step - 1 || d[c + 1] === step - 1 || d[c - cols] === step - 1 || d[c + cols] === step - 1) d[c] = step
      }
    }
  }
  const out = new Float32Array(cols * rows)
  for (let c = 0; c < out.length; c++) out[c] = d[c] === 0 ? 0 : d[c] === 255 ? 1 : (d[c] - 1) / reach
  return out
}

// A grid of the map plane (x east, y toward lon 0, km from the pole): cells listed row by row from the top.
function gridSource({ cols, rows, x0, y0, cellKm, heights, valid, feather, marginAt, base = false }) {
  return { cols, rows, x0, y0, cellKm, heights, valid, feather, marginAt, base, cache: new Float32Array(cols * rows), stamp: new Int32Array(cols * rows) }
}

/** The 500 m chunks as one grid (holes where a chunk is missing). */
function mergeChunks(chunks) {
  const { cells, sizeKm } = chunks[0]
  const cellKm = sizeKm / cells
  const half = sizeKm / 2
  const minX = Math.min(...chunks.map((c) => c.centerXKm - half))
  const maxX = Math.max(...chunks.map((c) => c.centerXKm + half))
  const minY = Math.min(...chunks.map((c) => c.centerYKm - half))
  const maxY = Math.max(...chunks.map((c) => c.centerYKm + half))
  const cols = Math.round((maxX - minX) / cellKm)
  const rows = Math.round((maxY - minY) / cellKm)
  const heights = new Float32Array(cols * rows)
  const valid = new Uint8Array(cols * rows)
  const owner = new Int16Array(cols * rows).fill(-1)
  const cellOf = new Uint16Array(cols * rows)
  chunks.forEach((chunk, k) => {
    const i0 = Math.round((chunk.centerXKm - half - minX) / cellKm)
    const j0 = Math.round((maxY - (chunk.centerYKm + half)) / cellKm)
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const m = (j0 + j) * cols + i0 + i
        heights[m] = chunk.heights[j * cells + i]
        valid[m] = 1
        owner[m] = k
        cellOf[m] = j * cells + i
      }
    }
  })
  return gridSource({
    cols,
    rows,
    x0: minX,
    y0: maxY,
    cellKm,
    heights,
    valid,
    feather: featherWeights(valid, cols, rows),
    marginAt: (m, sunDir) => sunMargin(chunks[owner[m]], chunks[owner[m]].frames, cellOf[m], sunDir, 0),
  })
}

/**
 * The grids the relief is built from, coarse to fine.
 *   terrain, frames: the 2.4 km overview (loadTerrain3d, buildCellFrames);  chunks: loaded 500 m chunks (fineGrid.js), may be empty;
 *   zone, zoneFrames: the fine zone of the site (zones.js) or null.
 */
export function reliefSources({ terrain, frames, chunks = [], zone = null, zoneFrames = null }) {
  const N = terrain.grid
  const sources = [
    gridSource({
      cols: N,
      rows: N,
      x0: -MAP_RADIUS_KM,
      y0: MAP_RADIUS_KM,
      cellKm: (2 * MAP_RADIUS_KM) / N,
      heights: terrain.heights,
      valid: frames.valid,
      feather: null,
      marginAt: (c, sunDir) => sunMargin(terrain, frames, c, sunDir, 0),
      base: true,
    }),
  ]
  if (chunks.length > 0) sources.push(mergeChunks(chunks))
  if (zone && zoneFrames) {
    const n = zone.cells
    const valid = new Uint8Array(n * n).fill(1)
    sources.push(
      gridSource({
        cols: n,
        rows: n,
        x0: zone.centerXKm - zone.sizeKm / 2,
        y0: zone.centerYKm + zone.sizeKm / 2,
        cellKm: zone.sizeKm / n,
        heights: zone.heights,
        valid,
        feather: featherWeights(valid, n, n),
        marginAt: (c, sunDir) => sunMargin(zone, zoneFrames, c, sunDir, 0),
      }),
    )
  }
  return sources
}

// Where a point of the map falls in a grid: the cell at the top left of the four around it and the fractions between them.
// Returns false when the four cells are not all there.
const spot = { c: 0, fx: 0, fy: 0 }
function locate(source, x, y) {
  const gi = (x - source.x0) / source.cellKm - 0.5
  const gj = (source.y0 - y) / source.cellKm - 0.5
  const i0 = Math.floor(gi)
  const j0 = Math.floor(gj)
  if (i0 < 0 || j0 < 0 || i0 > source.cols - 2 || j0 > source.rows - 2) return false
  spot.c = j0 * source.cols + i0
  spot.fx = gi - i0
  spot.fy = gj - j0
  return true
}
const bilinear = (values, cols, c, fx, fy) =>
  (values[c] * (1 - fx) + values[c + 1] * fx) * (1 - fy) + (values[c + cols] * (1 - fx) + values[c + cols + 1] * fx) * fy

/**
 * Height (m above the 1737.4 km sphere) of a point of the map plane (km), from the finest grids that cover it. `ref`, when given,
 * receives where the sunlight of that point is read: { source (index, or NO_SOURCE), c, fx, fy }.
 */
export function heightAt(sources, x, y, ref = null) {
  let h = 0
  if (ref) ref.source = NO_SOURCE
  for (let s = 0; s < sources.length; s++) {
    const source = sources[s]
    if (!locate(source, x, y)) continue
    const { c, fx, fy } = spot
    const { cols, valid } = source
    const allValid = valid[c] && valid[c + 1] && valid[c + cols] && valid[c + cols + 1]
    let weight = 1
    if (source.base) {
      // The overview has heights over its whole square; they fade out toward the 80 S circle, where the data ends.
      h = bilinear(source.heights, cols, c, fx, fy) * edgeTaper(Math.sqrt(x * x + y * y) / MAP_RADIUS_KM)
      if (!allValid) continue
    } else {
      if (!allValid) continue
      weight = bilinear(source.feather, cols, c, fx, fy)
      if (weight <= 0) continue
      h += (bilinear(source.heights, cols, c, fx, fy) - h) * weight
    }
    if (ref && weight >= 0.5) {
      ref.source = s
      ref.c = c
      ref.fx = fx
      ref.fy = fy
    }
  }
  return h
}

/**
 * The relief around an observer standing at (lat, lon).
 *   profile: the terrain horizon of the site, 360 values (deg), one per degree of azimuth;  sources: see reliefSources.
 * Returns {
 *   count, azimuths, rings, radiiM,
 *   positions: Float32Array(count * 3), km, in the axes of the scene (Moon-fixed), relative to the observer's eyes,
 *   local:     Float32Array(count * 3), m, (east, north, up) from the observer's eyes: what the shader works in,
 *   normals:   Float32Array(count * 3), in the same local axes,
 *   indices:   Uint32Array, triangles far to near,
 *   groundM:   height of the ground under the observer,
 *   skylineShift: Float32Array(azimuths), deg: the tilt that brings the data to the profile in each direction,
 *   and what reliefSunMargins needs (ref*, unit, siteWeight).
 * }
 * Vertex k * azimuths + a is on ring k (0 = nearest) toward azimuth a degrees; the last vertex is under the feet.
 */
export function buildSiteRelief({ lat, lon, profile, sources }) {
  const { up, east, north } = localFrame(lat, lon)
  const radiiM = reliefRadii()
  const A = RELIEF_AZIMUTHS
  const K = radiiM.length
  const count = A * K + 1
  const local = new Float32Array(count * 3)
  const unit = new Float32Array(count * 3)
  const refSource = new Uint8Array(count).fill(NO_SOURCE)
  const refCell = new Uint32Array(count)
  const refFx = new Float32Array(count)
  const refFy = new Float32Array(count)
  const ref = { source: NO_SOURCE, c: 0, fx: 0, fy: 0 }

  // Map plane (polar stereographic, km) of a unit vector: x = 2R uy / (1 - uz), y = 2R ux / (1 - uz).
  const x0 = (2 * R * up[1]) / (1 - up[2])
  const y0 = (2 * R * up[0]) / (1 - up[2])
  const groundM = heightAt(sources, x0, y0, ref)
  const eyeKm = R + (groundM + EYE_M) / 1000
  const store = (v, ux, uy, uz) => {
    const h = heightAt(sources, (2 * R * uy) / (1 - uz), (2 * R * ux) / (1 - uz), ref)
    const r = R + h / 1000
    const px = ux * r - up[0] * eyeKm
    const py = uy * r - up[1] * eyeKm
    const pz = uz * r - up[2] * eyeKm
    local[v * 3] = (px * east[0] + py * east[1] + pz * east[2]) * 1000
    local[v * 3 + 1] = (px * north[0] + py * north[1] + pz * north[2]) * 1000
    local[v * 3 + 2] = (px * up[0] + py * up[1] + pz * up[2]) * 1000
    unit[v * 3] = ux
    unit[v * 3 + 1] = uy
    unit[v * 3 + 2] = uz
    refSource[v] = ref.source
    refCell[v] = ref.c
    refFx[v] = ref.fx
    refFy[v] = ref.fy
  }
  const sinD = radiiM.map((r) => Math.sin(r / 1000 / R))
  const cosD = radiiM.map((r) => Math.cos(r / 1000 / R))
  for (let a = 0; a < A; a++) {
    const ca = Math.cos(a / DEG)
    const sa = Math.sin(a / DEG)
    const tx = north[0] * ca + east[0] * sa // unit tangent toward this azimuth
    const ty = north[1] * ca + east[1] * sa
    const tz = north[2] * ca + east[2] * sa
    for (let k = 0; k < K; k++) store(k * A + a, up[0] * cosD[k] + tx * sinD[k], up[1] * cosD[k] + ty * sinD[k], up[2] * cosD[k] + tz * sinD[k])
  }
  store(count - 1, up[0], up[1], up[2])

  // The skyline of the analysis: in each direction the column is tilted (every point raised or lowered by the same angle seen from
  // the observer, less under WARP_FULL_M and not at all under WARP_FROM_M, so the ground at the feet stays as the data has it) by
  // the angle that brings its highest point to the horizon of the profile. The same rule in every direction: no step between two
  // neighbors. Most of that angle is the 2 m of the eyes (the profile is taken from the ground) and what coarser grids smooth.
  const el = new Float64Array(K)
  const skylineShift = new Float32Array(A)
  const warp = radiiM.map((r) => smoothstep(Math.log(WARP_FROM_M), Math.log(WARP_FULL_M), Math.log(r)))
  const firstMoved = warp.findIndex((w) => w > 0.02)
  for (let a = 0; a < A; a++) {
    for (let k = 0; k < K; k++) {
      const v = (k * A + a) * 3
      el[k] = Math.atan2(local[v + 2], Math.sqrt(local[v] * local[v] + local[v + 1] * local[v + 1])) * DEG
    }
    const horizon = profile[a]
    // The highest point depends on the tilt (far points move more), so the tilt is found in a few steps.
    let delta = 0
    for (let step = 0; step < 8; step++) {
      let top = firstMoved
      for (let k = firstMoved; k < K; k++) if (el[k] + delta * warp[k] > el[top] + delta * warp[top]) top = k
      const gap = horizon - (el[top] + delta * warp[top])
      if (Math.abs(gap) < 1e-4) break
      delta += gap / Math.max(warp[top], 0.05)
    }
    skylineShift[a] = delta
    for (let k = 0; k < K; k++) {
      const moved = Math.min(el[k] + delta * warp[k], horizon)
      if (moved === el[k]) continue
      const v = (k * A + a) * 3
      const flat = Math.sqrt(local[v] * local[v] + local[v + 1] * local[v + 1])
      const slant = Math.sqrt(flat * flat + local[v + 2] * local[v + 2])
      const scale = (slant * Math.cos(moved / DEG)) / flat
      local[v] *= scale
      local[v + 1] *= scale
      local[v + 2] = slant * Math.sin(moved / DEG)
    }
  }

  // Triangles, far to near (see the top of the file), all facing up.
  const indices = new Uint32Array(A * ((K - 1) * 6 + 3))
  let n = 0
  for (let k = K - 2; k >= 0; k--) {
    for (let a = 0; a < A; a++) {
      const inner = k * A + a
      const innerNext = k * A + ((a + 1) % A)
      indices[n++] = inner
      indices[n++] = innerNext
      indices[n++] = inner + A
      indices[n++] = innerNext
      indices[n++] = innerNext + A
      indices[n++] = inner + A
    }
  }
  for (let a = 0; a < A; a++) {
    indices[n++] = count - 1
    indices[n++] = (a + 1) % A
    indices[n++] = a
  }

  // Normals (local axes): the sum of the normals of the triangles around each vertex.
  const normals = new Float32Array(count * 3)
  for (let t = 0; t < indices.length; t += 3) {
    const i = indices[t] * 3
    const j = indices[t + 1] * 3
    const k = indices[t + 2] * 3
    const ax = local[j] - local[i]
    const ay = local[j + 1] - local[i + 1]
    const az = local[j + 2] - local[i + 2]
    const bx = local[k] - local[i]
    const by = local[k + 1] - local[i + 1]
    const bz = local[k + 2] - local[i + 2]
    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    nx /= length
    ny /= length
    nz /= length
    normals[i] += nx
    normals[i + 1] += ny
    normals[i + 2] += nz
    normals[j] += nx
    normals[j + 1] += ny
    normals[j + 2] += nz
    normals[k] += nx
    normals[k + 1] += ny
    normals[k + 2] += nz
  }
  for (let v = 0; v < count * 3; v += 3) {
    const length = Math.sqrt(normals[v] * normals[v] + normals[v + 1] * normals[v + 1] + normals[v + 2] * normals[v + 2]) || 1
    normals[v] /= length
    normals[v + 1] /= length
    normals[v + 2] /= length
  }

  // The same vertices in the axes of the scene, in km.
  const positions = new Float32Array(count * 3)
  for (let v = 0; v < count * 3; v += 3) {
    const e = local[v] / 1000
    const no = local[v + 1] / 1000
    const u = local[v + 2] / 1000
    positions[v] = e * east[0] + no * north[0] + u * up[0]
    positions[v + 1] = e * east[1] + no * north[1] + u * up[1]
    positions[v + 2] = e * east[2] + no * north[2] + u * up[2]
  }

  const siteWeight = new Float32Array(K + 1)
  for (let k = 0; k < K; k++) siteWeight[k] = 1 - smoothstep(SITE_LIGHT_FULL_M, SITE_LIGHT_NONE_M, radiiM[k])
  siteWeight[K] = 1
  return { count, azimuths: A, rings: K, radiiM, positions, local, normals, indices, groundM, skylineShift, unit, refSource, refCell, refFx, refFy, siteWeight, step: 0 }
}

/**
 * Height of the Sun's center above the terrain horizon (deg) at every vertex of the relief, for one direction of the Sun: positive
 * where the ground is sunlit. Read from the grid cells around each vertex (the same horizons as the map layers); within a few
 * hundred meters of the observer it becomes `siteMargin`, the one of the site itself (its own profile); outside the data, the
 * height of the Sun above the smooth sphere.
 *   sunDir: unit vector toward the Sun (Moon-fixed);  out: Float32Array(relief.count) to fill;
 *   sector: { center, half } (deg of azimuth) to only work out the directions within `half` of `center` (what the camera sees:
 *   three times less work per step of the timeline), or null for all of them. The other values of `out` are left as they are.
 */
export function reliefSunMargins(relief, sources, sunDir, siteMargin, out = new Float32Array(relief.count), sector = null) {
  const { count, azimuths, rings, unit, refSource, refCell, refFx, refFy, siteWeight } = relief
  const step = ++relief.step
  // The margin of a grid cell is worked out once per moment, whatever the number of vertices around it.
  const cellMargin = (source, c) => {
    if (source.stamp[c] !== step) {
      source.stamp[c] = step
      source.cache[c] = source.marginAt(c, sunDir)
    }
    return source.cache[c]
  }
  out[count - 1] = siteMargin
  const whole = !sector || sector.half >= 180
  const start = whole ? 0 : Math.floor((((sector.center - sector.half) % 360) + 360) % 360)
  const columns = whole ? azimuths : Math.min(azimuths, Math.ceil(2 * sector.half) + 2)
  for (let k = 0; k < rings; k++) {
    const near = siteWeight[k]
    const first = k * azimuths
    if (near >= 1) {
      out.fill(siteMargin, first, first + azimuths)
      continue
    }
    for (let n = 0; n < columns; n++) {
      const v = first + ((start + n) % azimuths)
      const source = sources[refSource[v]]
      let margin
      if (!source) {
        margin = Math.asin(Math.max(-1, Math.min(1, unit[v * 3] * sunDir[0] + unit[v * 3 + 1] * sunDir[1] + unit[v * 3 + 2] * sunDir[2]))) * DEG
      } else {
        const c = refCell[v]
        const fx = refFx[v]
        const fy = refFy[v]
        const cols = source.cols
        margin =
          (cellMargin(source, c) * (1 - fx) + cellMargin(source, c + 1) * fx) * (1 - fy) +
          (cellMargin(source, c + cols) * (1 - fx) + cellMargin(source, c + cols + 1) * fx) * fy
      }
      out[v] = margin * (1 - near) + siteMargin * near
    }
  }
  return out
}
