// A scenario = one site + one period. This module turns its Sun/Earth series into the numbers the
// interface shows, and compares two scenarios (two sites, or one site at two dates).
import { findWindows, marginSeries, summarize } from './visibility.js'

function analyzeMargins(samples) {
  const windows = findWindows(samples)
  return { samples, windows, summary: summarize(samples, windows) }
}

/**
 * Sun, Earth and "both at once" visibility for a series (see horizons.js for its shape).
 * minSunDeg / minEarthDeg: minimum elevation above the terrain horizon to count as visible.
 */
export function analyzeScenario(series, profile, { minSunDeg = 0, minEarthDeg = 0 } = {}) {
  const sun = marginSeries(series, 'sun', profile, minSunDeg)
  const earth = marginSeries(series, 'earth', profile, minEarthDeg)
  // Both visible at once <=> the smaller of the two margins is above zero.
  const both = sun.map((s, i) => ({ t: s.t, margin: Math.min(s.margin, earth[i].margin) }))
  return { sun: analyzeMargins(sun), earth: analyzeMargins(earth), both: analyzeMargins(both) }
}

// kind: how to format ('percent' = fraction 0..1, 'duration' = ms). higherIsBetter: direction of "good".
export const METRICS = [
  { key: 'sunLit', label: 'Sunlit', kind: 'percent', higherIsBetter: true, get: (a) => a.sun.summary.visibleFraction },
  { key: 'sunDark', label: 'Longest darkness', kind: 'duration', higherIsBetter: false, get: (a) => a.sun.summary.longestGapMs },
  { key: 'earthVisible', label: 'Earth visible', kind: 'percent', higherIsBetter: true, get: (a) => a.earth.summary.visibleFraction },
  { key: 'earthOutage', label: 'Longest Earth outage', kind: 'duration', higherIsBetter: false, get: (a) => a.earth.summary.longestGapMs },
  { key: 'bothVisible', label: 'Sun and Earth together', kind: 'percent', higherIsBetter: true, get: (a) => a.both.summary.visibleFraction },
  { key: 'bothLongest', label: 'Longest Sun + Earth window', kind: 'duration', higherIsBetter: true, get: (a) => a.both.summary.longestWindowMs },
]

const TOLERANCE = { percent: 0.005, duration: 60000 } // below this a difference is "same"

/** Row per metric: values for A and B, delta (B - A) and which side is better ('a' | 'b' | 'same'). */
export function compareScenarios(a, b) {
  return METRICS.map((m) => {
    const va = m.get(a)
    const vb = m.get(b)
    const delta = vb - va
    let better = 'same'
    if (Math.abs(delta) > TOLERANCE[m.kind]) better = delta > 0 === m.higherIsBetter ? 'b' : 'a'
    return { key: m.key, label: m.label, kind: m.kind, a: va, b: vb, delta, better }
  })
}
