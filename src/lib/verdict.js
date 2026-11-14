// Green / orange / red verdicts for one scenario, from the mission requirements (the rover's needs).
// No home-made scores: each verdict compares a measured value with a limit the user typed in.
//   ok   = requirement met with margin       warn = met, but close to the limit
//   fail = requirement not met
import { formatDuration } from './format.js'
import { stateAt } from './visibility.js'

export const DEFAULT_REQUIREMENTS = {
  minSunDeg: 0, // Sun must be this high above the terrain horizon to count as visible
  minEarthDeg: 0, // same for Earth (antenna pointing limit)
  batteryHours: 240, // longest darkness the rover survives (placeholder: set it from the rover's data sheet)
  linkMinPerHour: 30, // direct-to-Earth link time needed, minutes per hour
  landingMinutes: 10, // Sun and Earth both needed for the landing sequence
}

export const LEVEL_LABEL = { ok: 'Feasible', warn: 'Marginal', fail: 'Not feasible' }
const ORDER = { ok: 0, warn: 1, fail: 2 }

const HOUR = 3600000
const MINUTE = 60000
const MARGIN = 0.2 // within 20% of a limit = "warn"
const WINDOW_SAFETY = 3 // landing window shorter than 3x the sequence = "warn"

function powerVerdict(sun, req) {
  if (sun.summary.visibleFraction === 0) {
    return { level: 'fail', detail: 'The Sun never rises above the horizon in this period.' }
  }
  const darkH = sun.summary.longestGapMs / HOUR
  let level = 'ok'
  if (darkH > req.batteryHours) level = 'fail'
  else if (darkH > req.batteryHours * (1 - MARGIN)) level = 'warn'
  return {
    level,
    detail: `Longest darkness ${formatDuration(sun.summary.longestGapMs)} vs battery autonomy ${req.batteryHours} h.`,
  }
}

function commsVerdict(earth, req) {
  const minPerHour = earth.summary.visibleFraction * 60
  let level = 'ok'
  if (minPerHour < req.linkMinPerHour) level = 'fail'
  else if (minPerHour < req.linkMinPerHour * (1 + MARGIN)) level = 'warn'
  return {
    level,
    detail: `Earth link ${Math.round(minPerHour)} min per hour on average vs ${req.linkMinPerHour} min required.`,
  }
}

function windowVerdict(both, req, landingMs) {
  const state = stateAt(both.samples, both.windows, landingMs)
  if (!state.visible) {
    const next = state.remainingMs === null ? 'not in this period' : `next in ${formatDuration(state.remainingMs)}`
    return { level: 'fail', detail: `Sun and Earth are not both visible at landing (${next}).` }
  }
  if (state.remainingMs === null) {
    return { level: 'ok', detail: 'Sun and Earth stay visible together until the end of the period.' }
  }
  const need = req.landingMinutes * MINUTE
  let level = 'ok'
  if (state.remainingMs < need) level = 'fail'
  else if (state.remainingMs < need * WINDOW_SAFETY) level = 'warn'
  return {
    level,
    detail: `Sun and Earth visible together for ${formatDuration(state.remainingMs)} after landing; ${req.landingMinutes} min needed.`,
  }
}

/** { items: [{ key, label, level, detail }], overall } from analyzeScenario output and the landing instant (ms). */
export function evaluateScenario(analysis, req, landingMs) {
  const items = [
    { key: 'power', label: 'Power', ...powerVerdict(analysis.sun, req) },
    { key: 'comms', label: 'Communication', ...commsVerdict(analysis.earth, req) },
    { key: 'window', label: 'Landing window', ...windowVerdict(analysis.both, req, landingMs) },
  ]
  const overall = items.reduce((worst, i) => (ORDER[i.level] > ORDER[worst] ? i.level : worst), 'ok')
  return { items, overall }
}
