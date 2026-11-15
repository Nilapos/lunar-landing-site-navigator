// Sunlight, shadows and Earth visibility painted on the whole terrain at one instant.
//
// For each cell of the 3D grid: where are the Sun and the Earth in its sky (sky.js, from the sub-solar and
// sub-Earth points), and are they above its terrain horizon (horizonGrid.js)? Same rule as the per-site
// analysis, applied to about 51 000 cells.
import { AZIMUTHS, horizonAtCell } from './horizonGrid.js'
import { MAP_RADIUS_KM } from './polarMap.js'
import { earthDirection, localFrame, unitVector } from './sky.js'
import { MOON_RADIUS_M } from './terrain.js'
import { OPTIMAL_RGB } from './layerColors.js'

const DEG = 180 / Math.PI
const R_KM = MOON_RADIUS_M / 1000

/** Latitude, east longitude (deg) and distance from the pole as a fraction of the map radius, for a cell center. */
export function cellLatLon(grid, gx, gy) {
  const width = 2 * MAP_RADIUS_KM
  const x = ((gx + 0.5) / grid - 0.5) * width
  const y = (0.5 - (gy + 0.5) / grid) * width
  const rho = Math.hypot(x, y)
  return {
    lat: -90 + 2 * Math.atan(rho / (2 * R_KM)) * DEG,
    lon: (Math.atan2(x, y) * DEG + 360) % 360,
    edge: rho / MAP_RADIUS_KM,
  }
}

/**
 * Local frame (up, east, north) of every cell center, computed once. Cells without horizon data are marked
 * invalid (the corners of the map, outside the 80 S circle). `terrain` needs grid and horizon (see loadTerrain3d).
 */
export function buildCellFrames(terrain) {
  const N = terrain.grid
  const up = new Float32Array(N * N * 3)
  const east = new Float32Array(N * N * 3)
  const north = new Float32Array(N * N * 3)
  const valid = new Uint8Array(N * N)
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const c = gy * N + gx
      if (terrain.horizon[c * AZIMUTHS] === 0) continue
      const { lat, lon } = cellLatLon(N, gx, gy)
      const f = localFrame(lat, lon)
      up.set(f.up, c * 3)
      east.set(f.east, c * 3)
      north.set(f.north, c * 3)
      valid[c] = 1
    }
  }
  return { up, east, north, valid }
}

const dot3 = (a, i, v) => a[i] * v[0] + a[i + 1] * v[1] + a[i + 2] * v[2]
const clampAsin = (x) => Math.asin(Math.max(-1, Math.min(1, x))) * DEG

/**
 * RGBA pixels (grid x grid) for one instant.
 *   sample: { sunLon, sunLat, earthLon, earthLat, earthKm }   (one entry of /api/sky)
 *   options: { sun, earth, minSunDeg, minEarthDeg }
 * Sunlit cells are warm yellow and cells in shadow dark blue; cells from which the Earth is visible get a
 * blue-violet tint on top.
 */
export function visibilityOverlay(terrain, frames, sample, { sun = true, earth = true, minSunDeg = 0, minEarthDeg = 0 } = {}) {
  const N = terrain.grid
  const rgba = new Uint8ClampedArray(N * N * 4)
  const sunDir = unitVector(sample.sunLat, sample.sunLon)
  const earthUnit = unitVector(sample.earthLat, sample.earthLon)
  const { up, east, north, valid } = frames
  const cellUp = [0, 0, 0]

  for (let c = 0; c < N * N; c++) {
    if (!valid[c]) continue
    const i = c * 3
    const o = c * 4
    if (sun) {
      const el = clampAsin(dot3(up, i, sunDir))
      const az = (Math.atan2(dot3(east, i, sunDir), dot3(north, i, sunDir)) * DEG + 360) % 360
      if (el > horizonAtCell(terrain.horizon, c, az) + minSunDeg) {
        rgba[o] = 255
        rgba[o + 1] = 200
        rgba[o + 2] = 70
        rgba[o + 3] = 120
      } else {
        rgba[o] = 5
        rgba[o + 1] = 10
        rgba[o + 2] = 40
        rgba[o + 3] = 150
      }
    }
    if (earth) {
      cellUp[0] = up[i]
      cellUp[1] = up[i + 1]
      cellUp[2] = up[i + 2]
      const dir = earthDirection(cellUp, sample.earthLat, sample.earthLon, sample.earthKm, earthUnit)
      const el = clampAsin(dir[0] * up[i] + dir[1] * up[i + 1] + dir[2] * up[i + 2])
      const az = (Math.atan2(dot3(east, i, dir), dot3(north, i, dir)) * DEG + 360) % 360
      if (el > horizonAtCell(terrain.horizon, c, az) + minEarthDeg) {
        // Alpha-composite the Earth tint (blue-violet) over what is already there (sun or shadow).
        const a = 110 / 255
        const ba = rgba[o + 3] / 255
        const outA = a + ba * (1 - a)
        rgba[o] = (90 * a + rgba[o] * ba * (1 - a)) / outA
        rgba[o + 1] = (110 * a + rgba[o + 1] * ba * (1 - a)) / outA
        rgba[o + 2] = (255 * a + rgba[o + 2] * ba * (1 - a)) / outA
        rgba[o + 3] = outA * 255
      }
    }
  }
  return rgba
}

// --- "Optimal" layer: where a rover could land. A cell is good when its slope is under the rover's limit, the Sun is
// above its local horizon and the Earth is above its local horizon, all at once (same rules as the per-site analysis).

const GO_RGB = OPTIMAL_RGB // the color of the "Optimal" layer (layerColors.js)

export const sunMargin = (terrain, frames, c, sunDir, minDeg) => {
  const i = c * 3
  const el = clampAsin(dot3(frames.up, i, sunDir))
  const az = (Math.atan2(dot3(frames.east, i, sunDir), dot3(frames.north, i, sunDir)) * DEG + 360) % 360
  return el - horizonAtCell(terrain.horizon, c, az) - minDeg
}

export const earthMargin = (terrain, frames, c, sample, earthUnit, cellUp, minDeg) => {
  const i = c * 3
  cellUp[0] = frames.up[i]
  cellUp[1] = frames.up[i + 1]
  cellUp[2] = frames.up[i + 2]
  const dir = earthDirection(cellUp, sample.earthLat, sample.earthLon, sample.earthKm, earthUnit)
  const el = clampAsin(dir[0] * cellUp[0] + dir[1] * cellUp[1] + dir[2] * cellUp[2])
  const az = (Math.atan2(dot3(frames.east, i, dir), dot3(frames.north, i, dir)) * DEG + 360) % 360
  return el - horizonAtCell(terrain.horizon, c, az) - minDeg
}

/**
 * RGBA pixels (grid x grid) of the "Optimal" layer at one instant: neon green where the slope is under maxSlopeDeg and
 * the Sun and the Earth are both above the local horizon (plus the minimum elevations), a dark veil elsewhere.
 *   options: { minSunDeg, minEarthDeg, maxSlopeDeg }
 */
export function goOverlay(terrain, frames, sample, { minSunDeg = 0, minEarthDeg = 0, maxSlopeDeg = 15 } = {}) {
  const N = terrain.grid
  const rgba = new Uint8ClampedArray(N * N * 4)
  const sunDir = unitVector(sample.sunLat, sample.sunLon)
  const earthUnit = unitVector(sample.earthLat, sample.earthLon)
  const cellUp = [0, 0, 0]
  for (let c = 0; c < N * N; c++) {
    if (!frames.valid[c]) continue
    const o = c * 4
    const good =
      terrain.slope[c] < maxSlopeDeg &&
      sunMargin(terrain, frames, c, sunDir, minSunDeg) > 0 &&
      earthMargin(terrain, frames, c, sample, earthUnit, cellUp, minEarthDeg) > 0
    if (good) {
      rgba[o] = GO_RGB[0]
      rgba[o + 1] = GO_RGB[1]
      rgba[o + 2] = GO_RGB[2]
      rgba[o + 3] = 210
    } else {
      rgba[o + 3] = 120 // dark veil so the good cells stand out
    }
  }
  return rgba
}

/**
 * Share (0..1) of the period during which each cell is good (slope under the limit, Sun and Earth both up), as a
 * Float32Array of grid x grid. Cells outside the map or too steep stay at 0. To stay fast, at most `maxSamples` evenly
 * spaced samples of the period are tested.
 */
export function goFractions(terrain, frames, samples, { minSunDeg = 0, minEarthDeg = 0, maxSlopeDeg = 15 } = {}, maxSamples = 48) {
  const N = terrain.grid
  const out = new Float32Array(N * N)
  const stride = Math.max(1, Math.ceil(samples.length / maxSamples))
  const picked = samples.filter((_, k) => k % stride === 0)
  if (picked.length === 0) return out
  const cellUp = [0, 0, 0]
  for (const sample of picked) {
    const sunDir = unitVector(sample.sunLat, sample.sunLon)
    const earthUnit = unitVector(sample.earthLat, sample.earthLon)
    for (let c = 0; c < N * N; c++) {
      if (!frames.valid[c] || terrain.slope[c] >= maxSlopeDeg) continue
      if (sunMargin(terrain, frames, c, sunDir, minSunDeg) > 0 && earthMargin(terrain, frames, c, sample, earthUnit, cellUp, minEarthDeg) > 0) out[c] += 1
    }
  }
  for (let c = 0; c < N * N; c++) out[c] /= picked.length
  return out
}

/** The same layer painted from goFractions: the greener (more opaque), the longer the cell stays good. */
export function goFractionOverlay(terrain, frames, fractions) {
  const N = terrain.grid
  const rgba = new Uint8ClampedArray(N * N * 4)
  for (let c = 0; c < N * N; c++) {
    if (!frames.valid[c]) continue
    const o = c * 4
    const f = fractions[c]
    if (f > 0) {
      rgba[o] = GO_RGB[0]
      rgba[o + 1] = GO_RGB[1]
      rgba[o + 2] = GO_RGB[2]
      rgba[o + 3] = 70 + 160 * f
    } else {
      rgba[o + 3] = 120
    }
  }
  return rgba
}
