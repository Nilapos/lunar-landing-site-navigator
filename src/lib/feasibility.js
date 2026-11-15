// The "Feasible" layer: which cells you could land on, if you land at the moment shown on the timeline.
//
// Unlike "Optimal" (the Sun, the Earth and the slope fine at one instant, or for a share of the period), a cell is feasible when it
// holds up against the requirements, one by one, with the same rules as the verdict of a site (verdict.js, scores.js), measured from the
// landing moment over the mission that follows it (the same as the Sky card, Why and the best landing areas):
//   power    : battery autonomy / longest darkness ahead      (the Sun above the local horizon, plus the minimum elevation)
//   link     : the lower of (Earth link time per hour / needed) and (antenna data rate / needed)
//   window   : Sun and Earth both up at the moment, for how long / landing sequence needed
//   terrain  : landing slope limit / the cell's slope; with a rover also its drive slope limit / the cell's slope
// The verdict of the cell is the worst of the four: ok (ratio from 1.2), warn (from 1), fail (below 1). "Ahead" is the mission: `missionDays`
// days after the landing (30 by default, one lunar day-night cycle), or less if the range ends first.
//
// Before 2026-11-15 the layer asked for the requirements to hold over the WHOLE period, whenever you land. On the default period of a lunar
// year that is never true (every cell has a night of more than 8 days and loses the Earth for weeks): not one of the 50 960 cells was
// feasible, while the best landing areas, which judge from a landing moment, found feasible places. And judging a landing to the end of a
// year-long range was no better: only the last weeks of the range passed, hence the mission length.
//
// Speed. Sun and Earth visibility of every cell is computed ONCE for the range (one bit per cell and per sample, `prepare` / `fillBits`),
// then the verdict of the cells for any moment is a few bit operations per cell (`levelsAt`), so the layer follows the slider live.
// The range is sampled at most `maxSamples` times (hourly up to 30 days, 8 hours for a lunar year), so durations are accurate to about
// one sampling step: this is an overview, like the other cell layers.
import { earthMargin, sunMargin } from './illumination.js'
import { ANTENNAS, levelFromRatio, ratio } from './scores.js'
import { unitVector } from './sky.js'

const HOUR = 3600000
const MINUTE = 60000

/** Cell verdict codes in the arrays below: 0 = no data (outside the map), then 1 = fail, 2 = marginal, 3 = feasible. */
export const LEVEL_CODE = { fail: 1, warn: 2, ok: 3 }

export const OVERVIEW_SAMPLES = 360 // the 2.4 km map: hourly up to 15 days, every 2 h for 30 days, every day for a lunar year
export const FINE_SAMPLES = 240 // the 500 m chunks and the zones (more cells, computed at once)

// ---- bit helpers: bit k of the series of a cell is bit (k & 31) of word (k >> 5), the words of cell c start at c * words

function popcount(x) {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24
}

/** Number of set bits at positions [lo, hi) of the series starting at word `base`. */
function countBits(bits, base, lo, hi) {
  let count = 0
  for (let w = lo >> 5; w <= (hi - 1) >> 5 && lo < hi; w++) {
    let word = bits[base + w]
    const start = w << 5
    if (lo > start) word &= (0xffffffff << (lo - start)) >>> 0
    if (hi < start + 32) word &= (0xffffffff >>> (32 - (hi - start))) >>> 0
    count += popcount(word)
  }
  return count
}

/** First position in [pos, hi) where the series (the AND of `a` and, when given, `b`) has bit `value`, or `hi`. */
function nextBit(a, b, base, pos, hi, value) {
  for (let w = pos >> 5; (w << 5) < hi; w++) {
    let word = b === null ? a[base + w] : a[base + w] & b[base + w]
    if (!value) word = ~word
    word >>>= 0
    if (w === pos >> 5) word = (word & (0xffffffff << (pos & 31))) >>> 0
    if (word !== 0) {
      const found = (w << 5) + 31 - Math.clz32(word & -word)
      return found < hi ? found : hi
    }
  }
  return hi
}

/** Longest run of clear bits at positions [lo, hi): the darkness, leading and trailing stretches included. */
function longestClearRun(bits, base, lo, hi) {
  let longest = 0
  let pos = lo
  while (pos < hi) {
    const set = nextBit(bits, null, base, pos, hi, 1)
    if (set - pos > longest) longest = set - pos
    pos = nextBit(bits, null, base, set, hi, 0)
  }
  return longest
}

const bitAt = (bits, base, k) => (bits[base + (k >> 5)] >>> (k & 31)) & 1

// ---- the sky of the range, prepared once

/** The sky samples prepared once for all cells: directions of the Sun and the Earth, the time between two samples (ms) and the stride. */
export function prepareSky(samples, maxSamples = OVERVIEW_SAMPLES) {
  const stride = Math.max(1, Math.ceil(samples.length / maxSamples))
  const picked = samples.filter((_, k) => k % stride === 0)
  const times = picked.map((s) => Date.parse(s.t))
  const stepMs = picked.length > 1 ? (times[times.length - 1] - times[0]) / (picked.length - 1) : HOUR
  return {
    picked,
    stride,
    stepMs,
    words: Math.ceil(picked.length / 32),
    sunDirs: picked.map((s) => unitVector(s.sunLat, s.sunLon)),
    earthUnits: picked.map((s) => unitVector(s.earthLat, s.earthLon)),
  }
}

/**
 * What the visibility bits depend on: the minimum elevations, and the slope limits (a cell too steep for them is not computed at all: it
 * fails whatever the Sun and the Earth do). The other requirements only change the verdict computed from the bits.
 */
export const visibilityKey = (req) => `${req.minSunDeg}|${req.minEarthDeg}|${req.maxSlopeDeg}|${req.driveSlopeDeg}`

/** Is the cell too steep for the lander (or the rover): it fails whatever the sky does. */
const tooSteep = (terrain, req, c) => terrain.slope[c] > req.maxSlopeDeg || (req.driveSlopeDeg != null && terrain.slope[c] > req.driveSlopeDeg)

/**
 * Empty visibility bits for a terrain and a prepared sky: { sky, key, cells, sun, earth } (Uint32Array of cells x words each).
 * `fillBits` then fills cells [from, to), in slices if wanted.
 */
export function createPrep(terrain, sky, req) {
  const cells = terrain.grid * terrain.grid
  return { sky, key: visibilityKey(req), cells, sun: new Uint32Array(cells * sky.words), earth: new Uint32Array(cells * sky.words) }
}

/** Sets the bits of the cells [from, to): bit k = the Sun (resp. the Earth) is above the horizon of the cell, plus the minimum elevation, at sample k. */
export function fillBits(terrain, frames, prep, req, from = 0, to = prep.cells) {
  const { sky, sun, earth } = prep
  const cellUp = [0, 0, 0]
  const n = sky.picked.length
  for (let c = from; c < to; c++) {
    if (!frames.valid[c] || tooSteep(terrain, req, c)) continue
    const base = c * sky.words
    for (let k = 0; k < n; k++) {
      if (sunMargin(terrain, frames, c, sky.sunDirs[k], req.minSunDeg) > 0) sun[base + (k >> 5)] |= 1 << (k & 31)
      if (earthMargin(terrain, frames, c, sky.picked[k], sky.earthUnits[k], cellUp, req.minEarthDeg) > 0) earth[base + (k >> 5)] |= 1 << (k & 31)
    }
  }
}

/** Index of the prepared sky for the timeline sample `sampleIndex`: the first prepared sample at or after it. */
export const momentIndex = (sky, sampleIndex) => Math.min(sky.picked.length - 1, Math.ceil(sampleIndex / sky.stride))

// ---- the verdict of a cell for a landing moment

/**
 * The ratios (offered / needed) of the four requirements for landing on cell `c` at prepared sample `m`, measured over the mission that follows
 * (req.missionDays, or to the last prepared sample if sooner): { power, link, window, ground }. `req`: { batteryHours, linkMinPerHour, bandwidthKbps, antenna, landingMinutes, maxSlopeDeg,
 * driveSlopeDeg }. Nothing is left of the period when m is the last sample: every ratio is 0.
 */
export function cellRatios(terrain, prep, req, c, m) {
  const { sky, sun, earth } = prep
  const last = sky.picked.length - 1
  const missionSteps = Number.isFinite(req.missionDays) ? Math.max(1, Math.round((req.missionDays * 24 * HOUR) / sky.stepMs)) : Infinity
  const end = Math.min(last, m + missionSteps) // where the mission ends
  const left = end - m // intervals of one step between the landing and the end of the mission
  const slope = terrain.slope[c]
  let ground = ratio(req.maxSlopeDeg, slope)
  if (req.driveSlopeDeg != null) ground = Math.min(ground, ratio(req.driveSlopeDeg, slope))
  if (left <= 0) return { power: 0, link: 0, window: 0, ground } // landing on the last moment: nothing left to judge
  const base = c * sky.words
  const sunUp = countBits(sun, base, m, end)
  const power = sunUp === 0 ? 0 : ratio(req.batteryHours, (longestClearRun(sun, base, m, end) * sky.stepMs) / HOUR)
  const earthShare = countBits(earth, base, m, end) / left
  const link = Math.min(ratio(earthShare * 60, req.linkMinPerHour), ratio(ANTENNAS[req.antenna].downlinkKbps, req.bandwidthKbps))
  let window = 0
  if (bitAt(sun, base, m) && bitAt(earth, base, m)) {
    const over = nextBit(sun, earth, base, m, end, 0) // first sample where one of them is down
    window = over >= end ? Infinity : ratio((over - m) * sky.stepMs, req.landingMinutes * MINUTE) // Infinity: together until the end
  }
  return { power, link, window, ground }
}

/** Verdict code of cell `c` for a landing at prepared sample `m`. */
export function cellLevel(terrain, frames, prep, req, c, m) {
  if (!frames.valid[c]) return 0
  const r = cellRatios(terrain, prep, req, c, m)
  return LEVEL_CODE[levelFromRatio(Math.min(r.power, r.link, r.window, r.ground))]
}

/**
 * Verdict codes of all the cells for a landing at the timeline sample `sampleIndex` (an index of the samples the sky was prepared from),
 * written into `out` (Uint8Array, grid x grid; a new one when left out).
 */
export function levelsAt(terrain, frames, prep, req, sampleIndex, out = new Uint8Array(prep.cells)) {
  const m = momentIndex(prep.sky, sampleIndex)
  for (let c = 0; c < prep.cells; c++) out[c] = cellLevel(terrain, frames, prep, req, c, m)
  return out
}

/** Everything at once, for a terrain that is small or computed rarely (tests, fine chunks, zones): the prepared bits for `samples`. */
export function prepareFeasibility(terrain, frames, samples, req, maxSamples = FINE_SAMPLES) {
  const prep = createPrep(terrain, prepareSky(samples, maxSamples), req)
  fillBits(terrain, frames, prep, req)
  return prep
}

/** Verdict codes of the cells for a landing at `sampleIndex` of `samples` (see levelsAt). */
export function feasibilityLevels(terrain, frames, samples, req, sampleIndex = 0, maxSamples = OVERVIEW_SAMPLES) {
  return levelsAt(terrain, frames, prepareFeasibility(terrain, frames, samples, req, maxSamples), req, sampleIndex)
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

/** The requirement fields that change the verdict of a cell: when none changed, the levels do not need computing again. */
export function feasibilityKey(req) {
  return [req.minSunDeg, req.minEarthDeg, req.batteryHours, req.linkMinPerHour, req.bandwidthKbps, req.antenna, req.landingMinutes, req.maxSlopeDeg, req.driveSlopeDeg, req.missionDays].join('|')
}
