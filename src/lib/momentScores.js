// "What if we land at this moment?": the scores of a scenario when the landing happens at `atMs` instead of at the
// start of the period. Everything is measured over the MISSION that follows the landing (darkness, Earth link time, window
// length): `requirements.missionDays` days after the moment (30 by default, one lunar day-night cycle), or less if the period ends
// first (or `untilMs`), with the same rules as evaluateScenario.
//
// Why not "to the end of the period": on a period of a lunar year, judging a landing in November by the nights of the following
// October made every place fail until the last weeks of the period.
import { analyzeScenario } from './scenario.js'
import { evaluateScenario } from './verdict.js'

const DAY = 86400000

// The times (ms) of a series, parsed once per series (the series are not modified).
const timeCache = new WeakMap()
function timesOf(series) {
  let times = timeCache.get(series)
  if (!times) {
    times = Float64Array.from(series, (p) => Date.parse(p.t))
    timeCache.set(series, times)
  }
  return times
}

/** Index of the first time >= ms (series.length when none). */
function lowerBound(times, ms) {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] < ms) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The end (ms) of the mission that starts at atMs: its length after it, or the period's end if sooner. Infinity: no limit. */
export function missionEndMs(requirements, atMs, untilMs = Infinity) {
  const length = Number.isFinite(requirements.missionDays) ? atMs + requirements.missionDays * DAY : Infinity
  return Math.min(length, untilMs)
}

/**
 * result: { data: { series }, profile, terrain } as returned by useScenario; requirements: the mission requirements.
 * Returns { analysis, evaluation } for the mission that starts at atMs, or null when fewer than two samples are in it.
 */
export function analyzeFromMoment(result, requirements, atMs, untilMs = Infinity) {
  if (!result.data) return null
  const stop = missionEndMs(requirements, atMs, untilMs)
  const times = timesOf(result.data.series)
  const from = lowerBound(times, atMs)
  const to = Number.isFinite(stop) ? lowerBound(times, stop + 1) : times.length // up to and including the sample at `stop`
  const series = result.data.series.slice(from, to)
  if (series.length < 2) return null
  const analysis = analyzeScenario(series, result.profile, { minSunDeg: requirements.minSunDeg, minEarthDeg: requirements.minEarthDeg })
  return { analysis, evaluation: evaluateScenario(analysis, requirements, Date.parse(series[0].t), result.terrain) }
}

const LEVEL_RANK = { ok: 0, warn: 1, fail: 2 }

/** The requirement that holds an evaluation back, in words (the informative energy item never does). */
export function reasonOf(evaluation) {
  if (evaluation.overall === 'ok') return 'every requirement is met with margin'
  const held = evaluation.items.filter((i) => !i.informative && i.level !== 'ok')
  const worst = held.reduce((w, i) => (LEVEL_RANK[i.level] > LEVEL_RANK[w.level] || (i.level === w.level && i.ratio < w.ratio) ? i : w))
  return `${worst.label}: ${worst.detail}`
}

/** The evaluation of analyzeFromMoment, or null (see evaluateScenario for its shape). */
export function evaluateFromMoment(result, requirements, atMs, untilMs = Infinity) {
  return analyzeFromMoment(result, requirements, atMs, untilMs)?.evaluation ?? null
}
