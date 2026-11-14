// The "Feasible" layer: which cells meet the mission requirements over the whole period.
//
// Unlike "Optimal" (the Sun, the Earth and the slope fine at one instant, or for a share of the period), a cell is feasible when
// it holds up against the requirements, one by one, with the same rule as the verdict of a site (verdict.js, scores.js):
//   power    : battery autonomy / longest darkness            (the Sun above the local horizon, plus the minimum elevation)
//   link     : the lower of (Earth link time per hour / needed) and (antenna data rate / needed)
//   terrain  : landing slope limit / the cell's slope; with a rover also its drive slope limit / the cell's slope
// The verdict of the cell is the worst of the three: ok (ratio from 1.2), warn (from 1), fail (below 1). The landing window is not
// part of it: it depends on the day you pick, not on the place. To stay fast the period is sampled (at most `maxSamples` evenly
// spaced samples), so durations are accurate to about one sampling step: this is an overview, like the other cell layers.
import { earthMargin, sunMargin } from './illumination.js'
import { ANTENNAS, levelFromRatio, ratio } from './scores.js'
import { unitVector } from './sky.js'

const HOUR = 3600000

/** Cell verdict codes in the arrays below: 0 = no data (outside the map), then 1 = fail, 2 = marginal, 3 = feasible. */
export const LEVEL_CODE = { fail: 1, warn: 2, ok: 3 }

/** The sky samples prepared once for all cells: directions of the Sun and the Earth, and the time between two samples (ms). */
export function prepareSky(samples, maxSamples = 90) {
  const stride = Math.max(1, Math.ceil(samples.length / maxSamples))
  const picked = samples.filter((_, k) => k % stride === 0)
  const times = picked.map((s) => Date.parse(s.t))
  const stepMs = picked.length > 1 ? (times[times.length - 1] - times[0]) / (picked.length - 1) : HOUR
  return { picked, stepMs, sunDirs: picked.map((s) => unitVector(s.sunLat, s.sunLon)), earthUnits: picked.map((s) => unitVector(s.earthLat, s.earthLon)) }
}

/**
 * Verdict code of one cell. `req`: { minSunDeg, minEarthDeg, batteryHours, linkMinPerHour, bandwidthKbps, antenna, maxSlopeDeg,
 * driveSlopeDeg }. `cellUp` is a scratch array of 3 numbers.
 */
export function cellLevel(terrain, frames, c, sky, req, cellUp = [0, 0, 0]) {
  if (!frames.valid[c]) return 0
  const n = sky.picked.length
  let sunSamples = 0
  let earthSamples = 0
  let darkRun = 0
  let longestDark = 0
  for (let k = 0; k < n; k++) {
    if (sunMargin(terrain, frames, c, sky.sunDirs[k], req.minSunDeg) > 0) {
      sunSamples++
      darkRun = 0
    } else {
      darkRun++
      if (darkRun > longestDark) longestDark = darkRun
    }
    if (earthMargin(terrain, frames, c, sky.picked[k], sky.earthUnits[k], cellUp, req.minEarthDeg) > 0) earthSamples++
  }
  const power = sunSamples === 0 ? 0 : ratio(req.batteryHours, (longestDark * sky.stepMs) / HOUR)
  const link = Math.min(ratio((earthSamples / n) * 60, req.linkMinPerHour), ratio(ANTENNAS[req.antenna].downlinkKbps, req.bandwidthKbps))
  const slope = terrain.slope[c]
  let ground = ratio(req.maxSlopeDeg, slope)
  if (req.driveSlopeDeg != null) ground = Math.min(ground, ratio(req.driveSlopeDeg, slope))
  return LEVEL_CODE[levelFromRatio(Math.min(power, link, ground))]
}

/** Verdict codes of the cells [from, to) written into `out` (Uint8Array, grid x grid). Used directly, or sliced by the app. */
export function fillLevels(terrain, frames, sky, req, out, from = 0, to = terrain.grid * terrain.grid) {
  const cellUp = [0, 0, 0]
  for (let c = from; c < to; c++) out[c] = cellLevel(terrain, frames, c, sky, req, cellUp)
  return out
}

/** All the cells at once (fine for the 500 m chunks and the zones; the 2.4 km map is sliced by useFeasibility). */
export function feasibilityLevels(terrain, frames, samples, req, maxSamples = 90) {
  return fillLevels(terrain, frames, prepareSky(samples, maxSamples), req, new Uint8Array(terrain.grid * terrain.grid))
}

/** Neon green for feasible cells (keep in sync with --color-layer-go), amber for marginal ones, a dark veil elsewhere. */
export function feasibilityOverlay(terrain, frames, levels) {
  const N = terrain.grid
  const rgba = new Uint8ClampedArray(N * N * 4)
  for (let c = 0; c < N * N; c++) {
    if (!frames.valid[c]) continue
    const o = c * 4
    if (levels[c] === LEVEL_CODE.ok) {
      rgba.set([57, 255, 20, 215], o)
    } else if (levels[c] === LEVEL_CODE.warn) {
      rgba.set([255, 183, 77, 200], o)
    } else {
      rgba[o + 3] = 120
    }
  }
  return rgba
}

/** The requirement fields that change the result: when none changed, the levels do not need computing again. */
export function feasibilityKey(req) {
  return [req.minSunDeg, req.minEarthDeg, req.batteryHours, req.linkMinPerHour, req.bandwidthKbps, req.antenna, req.maxSlopeDeg, req.driveSlopeDeg].join('|')
}
