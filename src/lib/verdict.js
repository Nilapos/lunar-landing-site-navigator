// Verdicts and scores for one scenario, from the mission requirements (the rover's needs).
// Each item compares a measured value with a limit the user typed in (see scores.js for the rule):
//   ok = met with margin    warn = met but within 20% of the limit    fail = not met
import { formatDuration } from './format.js'
import { ANTENNAS, fractionSteeperThan, levelFromRatio, marginScore, ratio } from './scores.js'
import { stateAt } from './visibility.js'

export const DEFAULT_REQUIREMENTS = {
  minSunDeg: 0, // Sun must be this high above the terrain horizon to count as visible
  minEarthDeg: 0, // same for Earth (antenna pointing limit)
  batteryHours: 240, // longest darkness the rover survives (placeholder: take it from the rover's data sheet)
  linkMinPerHour: 30, // direct-to-Earth link time needed, minutes per hour
  bandwidthKbps: 256, // data rate needed to Earth
  antenna: 'mga', // antenna class, see ANTENNAS
  landingMinutes: 10, // Sun and Earth both needed for the landing sequence
  maxSlopeDeg: 15, // steepest slope the rover can drive
}

export const LEVEL_LABEL = { ok: 'Feasible', warn: 'Marginal', fail: 'Not feasible' }
const ORDER = { ok: 0, warn: 1, fail: 2 }

const HOUR = 3600000
const MINUTE = 60000

export function powerItem(sun, req) {
  if (sun.summary.visibleFraction === 0) {
    return { ratio: 0, detail: 'The Sun never rises above the horizon in this period.' }
  }
  const dark = sun.summary.longestGapMs
  return {
    ratio: ratio(req.batteryHours, dark / HOUR),
    detail: `Longest darkness ${formatDuration(dark)} vs battery autonomy ${req.batteryHours} h.`,
  }
}

export function commsItem(earth, req) {
  const minPerHour = earth.summary.visibleFraction * 60
  const antenna = ANTENNAS[req.antenna]
  const timeRatio = ratio(minPerHour, req.linkMinPerHour)
  const rateRatio = ratio(antenna.downlinkKbps, req.bandwidthKbps)
  return {
    ratio: Math.min(timeRatio, rateRatio),
    detail:
      `Earth link ${Math.round(minPerHour)} min per hour vs ${req.linkMinPerHour} required; ` +
      `${antenna.label} antenna up to about ${antenna.downlinkKbps} kbps vs ${req.bandwidthKbps} kbps needed.`,
  }
}

function windowItem(both, req, landingMs) {
  const state = stateAt(both.samples, both.windows, landingMs)
  if (!state.visible) {
    const next = state.remainingMs === null ? 'not in this period' : `next in ${formatDuration(state.remainingMs)}`
    // shiftMs: how far to move the landing to reach the next window (null when there is none in the period).
    return { ratio: 0, detail: `Sun and Earth are not both visible at landing (${next}).`, shiftMs: state.remainingMs }
  }
  if (state.remainingMs === null) {
    return { ratio: Infinity, detail: 'Sun and Earth stay visible together until the end of the period.' }
  }
  return {
    ratio: ratio(state.remainingMs, req.landingMinutes * MINUTE),
    detail: `Sun and Earth visible together for ${formatDuration(state.remainingMs)} after landing; ${req.landingMinutes} min needed.`,
  }
}

function terrainItem(terrain, req) {
  const steeper = Math.round(100 * fractionSteeperThan(terrain.histogram500, req.maxSlopeDeg))
  return {
    ratio: ratio(req.maxSlopeDeg, terrain.slopeMaxDeg),
    detail:
      `Steepest slope within 100 m ${terrain.slopeMaxDeg.toFixed(1)}° vs rover limit ${req.maxSlopeDeg}°; ` +
      `${steeper}% of the ground within 500 m is steeper than the limit.`,
  }
}

/**
 * { items: [{ key, label, ratio, score, level, detail }], overall, scores }.
 * `analysis` from analyzeScenario, `landingMs` the landing instant, `terrain` the site's slope statistics.
 * scores = { solar, telecom, window, topography, global } (global = average of the four, as in the mockup).
 */
export function evaluateScenario(analysis, req, landingMs, terrain) {
  const raw = [
    { key: 'power', label: 'Power', ...powerItem(analysis.sun, req) },
    { key: 'comms', label: 'Communication', ...commsItem(analysis.earth, req) },
    { key: 'window', label: 'Landing window', ...windowItem(analysis.both, req, landingMs) },
    { key: 'terrain', label: 'Terrain', ...terrainItem(terrain, req) },
  ]
  const items = raw.map((i) => ({ ...i, score: marginScore(i.ratio), level: levelFromRatio(i.ratio) }))
  const overall = items.reduce((worst, i) => (ORDER[i.level] > ORDER[worst] ? i.level : worst), 'ok')
  const [solar, telecom, window, topography] = items.map((i) => i.score)
  const global = Math.round((solar + telecom + window + topography) / 4)
  return { items, overall, scores: { solar, telecom, window, topography, global } }
}
