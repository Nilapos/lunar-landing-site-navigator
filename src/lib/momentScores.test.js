import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateFromMoment } from './momentScores.js'
import { DEFAULT_REQUIREMENTS, evaluateScenario } from './verdict.js'
import { analyzeScenario } from './scenario.js'

const HOUR = 3600000
const T0 = Date.UTC(2026, 10, 14)
// 48 hourly samples: the Sun and the Earth are both up from hour 10 to hour 30, otherwise below the horizon.
const series = Array.from({ length: 48 }, (_, h) => {
  const up = h >= 10 && h < 30
  return { t: new Date(T0 + h * HOUR).toISOString(), sunEl: up ? 5 : -5, sunAz: 0, earthEl: up ? 5 : -5, earthAz: 0 }
})
const profile = new Array(360).fill(0)
const terrain = { slopeMaxDeg: 5, histogram500: [10, 0, 0, 0, 0, 0] }
const result = { data: { series }, profile, terrain }
const REQ = { ...DEFAULT_REQUIREMENTS, landingMinutes: 60, batteryHours: 30 }

test('landing at the start gives the same scores as the plain evaluation', () => {
  const plain = evaluateScenario(analyzeScenario(series, profile), REQ, T0, terrain)
  assert.deepEqual(evaluateFromMoment(result, REQ, T0).scores, plain.scores)
})

test('landing when both bodies are up gives a window score, landing in the dark does not', () => {
  const dark = evaluateFromMoment(result, REQ, T0 + 2 * HOUR)
  const lit = evaluateFromMoment(result, REQ, T0 + 12 * HOUR)
  assert.equal(dark.scores.window, 0)
  assert.ok(lit.scores.window > 0)
  assert.ok(lit.scores.global > dark.scores.global)
})

test('the period is measured after the landing: the darkness before it no longer counts', () => {
  const early = evaluateFromMoment(result, REQ, T0)
  const late = evaluateFromMoment(result, REQ, T0 + 12 * HOUR)
  assert.ok(late.scores.solar >= early.scores.solar)
})

test('nothing to evaluate with fewer than two samples left, or without data', () => {
  assert.equal(evaluateFromMoment(result, REQ, T0 + 47 * HOUR), null)
  assert.equal(evaluateFromMoment({ ...result, data: null }, REQ, T0), null)
})
