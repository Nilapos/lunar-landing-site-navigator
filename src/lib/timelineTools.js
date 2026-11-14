// Pure helpers for the shared timeline bar (no React): stepping by an hour, a day or a week, and day marks.
import { formatDay } from './format.js'

const HOUR = 3600000
export const STEP_UNITS = [
  { key: 'hour', label: 'Hour', ms: HOUR },
  { key: 'day', label: 'Day', ms: 24 * HOUR },
  { key: 'week', label: 'Week', ms: 7 * 24 * HOUR },
]

/** Index of the item whose `t` (ISO string) is closest to `tMs`. Items are sorted by time. */
export function nearestIndex(items, tMs) {
  let lo = 0
  let hi = items.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (Date.parse(items[mid].t) < tMs) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && tMs - Date.parse(items[lo - 1].t) < Date.parse(items[lo].t) - tMs) return lo - 1
  return lo
}

/** Index reached by moving `direction` (+1 or -1) times `stepMs` from `index`, kept inside the series. */
export function stepIndex(samples, index, stepMs, direction) {
  const target = Date.parse(samples[index].t) + direction * stepMs
  const moved = nearestIndex(samples, target)
  // Always move at least one sample, so a step smaller than the sampling interval still advances.
  if (moved === index) return Math.min(Math.max(index + direction, 0), samples.length - 1)
  return moved
}

/** About `maxTicks` marks (the first sample of some UTC days) for the labels under the slider: [{ index, label }]. */
export function dayTicks(samples, maxTicks = 8) {
  const starts = []
  let lastDay = null
  samples.forEach((s, index) => {
    const day = s.t.slice(0, 10)
    if (day !== lastDay) starts.push({ index, label: formatDay(Date.parse(s.t)) })
    lastDay = day
  })
  const every = Math.max(1, Math.ceil(starts.length / maxTicks))
  return starts.filter((_, i) => i % every === 0)
}
