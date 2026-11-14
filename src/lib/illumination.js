// Sunlight, shadows and Earth visibility painted on the whole terrain at one instant.
//
// For each cell of the 3D grid: where are the Sun and the Earth in its sky (sky.js, from the sub-solar and
// sub-Earth points), and are they above its terrain horizon (horizonGrid.js)? Same rule as the per-site
// analysis, applied to about 51 000 cells.
import { AZIMUTHS, horizonAtCell } from './horizonGrid.js'
import { MAP_RADIUS_KM } from './polarMap.js'
import { earthDirection, localFrame, unitVector } from './sky.js'
import { MOON_RADIUS_M } from './terrain.js'

const DEG = 180 / Math.PI
const R_KM = MOON_RADIUS_M / 1000

/**
 * Local frame (up, east, north) of every cell center, computed once. Cells without horizon data are marked
 * invalid (the corners of the map, outside the 80 S circle). `terrain` needs grid and horizon (see loadTerrain3d).
 */
export function buildCellFrames(terrain) {
  const N = terrain.grid
  const width = 2 * MAP_RADIUS_KM
  const up = new Float32Array(N * N * 3)
  const east = new Float32Array(N * N * 3)
  const north = new Float32Array(N * N * 3)
  const valid = new Uint8Array(N * N)
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const c = gy * N + gx
      if (terrain.horizon[c * AZIMUTHS] === 0) continue
      const x = ((gx + 0.5) / N - 0.5) * width
      const y = (0.5 - (gy + 0.5) / N) * width
      const rho = Math.hypot(x, y)
      const lon = (Math.atan2(x, y) * DEG + 360) % 360
      const lat = -90 + 2 * Math.atan(rho / (2 * R_KM)) * DEG
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
