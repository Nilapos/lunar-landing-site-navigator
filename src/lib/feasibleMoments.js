// "Feasible" step of the timeline: jump to the next (or previous) moment where landing at the selected site gives the verdict
// Feasible (every requirement met with margin, the same evaluation as the Sky card: evaluateFromMoment).
//
// A full verdict takes a few milliseconds (it measures the rest of the period), so the moments are filtered first by two cheap
// conditions that a Feasible moment always meets:
//   - the landing window needs the Sun and the Earth both above the local horizon at the moment of landing;
//   - Night endurance needs every night still ahead to be short enough: a darkness that starts after the moment and lasts longer than
//     battery autonomy / 1.2 (the green threshold, scores.js) is counted by the verdict, so no moment before it can be Feasible.
// Verdicts already computed are kept in a cache (a Map) for the same site, period and requirements.
import { evaluateFromMoment } from './momentScores.js'
import { MARGIN } from './scores.js'

const HOUR = 3600000

/** Darkness gaps of the Sun between its windows: [{ start, length }] (ms), and the longest gap starting at or after each one. */
function nightsAhead(sun) {
  const gaps = []
  for (let i = 1; i < sun.windows.length; i++) gaps.push({ start: sun.windows[i - 1].end, length: sun.windows[i].start - sun.windows[i - 1].end })
  const longestFrom = new Array(gaps.length + 1).fill(0)
  for (let i = gaps.length - 1; i >= 0; i--) longestFrom[i] = Math.max(gaps[i].length, longestFrom[i + 1])
  return { gaps, longestFrom }
}

/** Longest darkness (ms) that starts at or after tMs. */
function longestNightAfter(nights, tMs) {
  let lo = 0
  let hi = nights.gaps.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (nights.gaps[mid].start < tMs) lo = mid + 1
    else hi = mid
  }
  return nights.longestFrom[lo]
}

/**
 * A fresh cache for one scenario result and one set of requirements: { requirements, both: Map(t -> margin), nights, verdicts }.
 * The verdicts are only valid for these requirements: a new set of requirements needs a new cache.
 */
export function feasibleCache(result, requirements) {
  const both = new Map()
  for (const s of result.analysis?.both.samples ?? []) both.set(s.t, s.margin)
  const nights = result.analysis ? nightsAhead(result.analysis.sun) : { gaps: [], longestFrom: [0] }
  return { requirements, both, nights, verdicts: new Map() }
}

/** Verdict ('ok' | 'warn' | 'fail') of landing at tMs; 'fail' at once when a cheap condition already rules the moment out. */
export function verdictAt(result, requirements, tMs, cache) {
  if (cache.verdicts.has(tMs)) return cache.verdicts.get(tMs)
  const margin = cache.both.get(tMs)
  const maxNightMs = (requirements.batteryHours * HOUR) / (1 + MARGIN)
  let level = 'fail'
  if (margin !== undefined && margin > 0 && longestNightAfter(cache.nights, tMs) <= maxNightMs) {
    level = evaluateFromMoment(result, requirements, tMs)?.overall ?? 'fail'
  }
  cache.verdicts.set(tMs, level)
  return level
}

/**
 * Index (in `samples`, the timeline's samples: { t } ISO strings) of the first moment after `fromIndex` (direction +1) or before it
 * (direction -1) whose verdict is Feasible, or null when there is none in the samples.
 */
export function findFeasibleIndex(result, requirements, samples, fromIndex, direction, cache) {
  if (!result.analysis || !samples) return null
  for (let i = fromIndex + direction; i >= 0 && i < samples.length; i += direction) {
    if (verdictAt(result, requirements, Date.parse(samples[i].t), cache) === 'ok') return i
  }
  return null
}
