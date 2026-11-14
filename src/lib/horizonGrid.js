// Terrain horizon for thousands of points (the 3D view colors every cell), so a faster version of
// terrain.js computeHorizonProfile: same geometry, but the walk along each azimuth uses unit vectors
// instead of trigonometry, distance steps grow with distance, and the horizon is stored coarsely.
//
// Storage: per cell, AZIMUTHS values (one per 360 / AZIMUTHS degrees, 0 = north, clockwise), each a byte:
//   byte = round((elevation_deg - HORIZON_MIN_DEG) / HORIZON_STEP_DEG) + 1, in 1..255 (0 = no data),
//   so -10 degrees is byte 1 and the highest value stored is 53.5 degrees.
import { localFrame } from './sky.js'
import { MOON_RADIUS_M } from './terrain.js'

export const AZIMUTHS = 72
export const HORIZON_MIN_DEG = -10
export const HORIZON_STEP_DEG = 0.25

const RAD = Math.PI / 180
const R = MOON_RADIUS_M

export function encodeHorizon(elevationDeg) {
  return Math.min(255, Math.max(1, Math.round((elevationDeg - HORIZON_MIN_DEG) / HORIZON_STEP_DEG) + 1))
}

export function decodeHorizon(byte) {
  return (byte - 1) * HORIZON_STEP_DEG + HORIZON_MIN_DEG
}

/**
 * Horizon elevation (deg) at azimuth `azDeg` for one cell, interpolated between the stored azimuths.
 * `horizon` is the whole Uint8Array, `cell` the cell index.
 */
export function horizonAtCell(horizon, cell, azDeg) {
  const pos = (((azDeg % 360) + 360) % 360) / (360 / AZIMUTHS)
  const i0 = Math.floor(pos)
  const f = pos - i0
  const base = cell * AZIMUTHS
  const a = decodeHorizon(horizon[base + (i0 % AZIMUTHS)])
  const b = decodeHorizon(horizon[base + ((i0 + 1) % AZIMUTHS)])
  return a * (1 - f) + b * f
}

/** Bilinear height (m) at a fractional pixel of the DEM, or NaN outside it. */
function heightAtPixel(dem, col, row) {
  const { size, data, heightFactor } = dem
  if (!(col >= 0 && row >= 0 && col < size - 1 && row < size - 1)) return NaN
  const c0 = Math.floor(col)
  const r0 = Math.floor(row)
  const fc = col - c0
  const fr = row - r0
  const i = r0 * size + c0
  const top = data[i] * (1 - fc) + data[i + 1] * fc
  const bottom = data[i + size] * (1 - fc) + data[i + size + 1] * fc
  return (top * (1 - fr) + bottom * fr) * heightFactor
}

// Distances (m) at which the terrain is sampled: fine near the site, then growing by 3% per step.
function buildDistances(stepM, maxDistanceM) {
  const out = []
  for (let d = stepM; d <= maxDistanceM; d += Math.max(stepM, d * 0.03)) out.push(d)
  return out
}

/**
 * Horizon (deg) for AZIMUTHS directions seen from a site. Returns a Float32Array.
 * `dem` as created by createDem; the site is given by its lat / lon (deg) and the height of the ground there.
 */
export function computeHorizonFast(dem, latDeg, lonDeg, groundM, { maxDistanceM = 200000, observerHeightM = 0 } = {}) {
  const { up, east, north } = localFrame(latDeg, lonDeg)
  const r0 = R + groundM + observerHeightM
  const distances = buildDistances(dem.scaleM, maxDistanceM)
  const sinD = distances.map((d) => Math.sin(d / R))
  const cosD = distances.map((d) => Math.cos(d / R))
  const scale = (2 * R) / dem.scaleM
  const out = new Float32Array(AZIMUTHS)

  for (let k = 0; k < AZIMUTHS; k++) {
    const az = (k * 360) / AZIMUTHS * RAD
    const sa = Math.sin(az)
    const ca = Math.cos(az)
    // Unit tangent vector toward this azimuth.
    const dx = east[0] * sa + north[0] * ca
    const dy = east[1] * sa + north[1] * ca
    const dz = east[2] * sa + north[2] * ca
    let best = -Infinity // largest tangent of the elevation angle
    for (let j = 0; j < distances.length; j++) {
      const px = up[0] * cosD[j] + dx * sinD[j]
      const py = up[1] * cosD[j] + dy * sinD[j]
      const pz = up[2] * cosD[j] + dz * sinD[j]
      const k1 = scale / (1 - pz)
      const h = heightAtPixel(dem, dem.center + py * k1, dem.center - px * k1)
      if (Number.isNaN(h)) break // left the map
      const r1 = R + h
      const t = (r1 * cosD[j] - r0) / (r1 * sinD[j])
      if (t > best) best = t
    }
    out[k] = best === -Infinity ? -90 : Math.atan(best) / RAD
  }
  return out
}
