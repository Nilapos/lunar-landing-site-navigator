import assert from 'node:assert/strict'
import { test } from 'node:test'
import { feasibleCache, findFeasibleIndex } from './feasibleMoments.js'
import { analyzeScenario } from './scenario.js'
import { DEFAULT_REQUIREMENTS } from './verdict.js'

// 96 hourly samples: the Sun is up from hour 30 on, the Earth is always up. Flat horizon, gentle terrain.
const HOUR = 3600000
const T0 = Date.UTC(2026, 10, 15)
const series = Array.from({ length: 96 }, (_, h) => ({
  t: new Date(T0 + h * HOUR).toISOString(),
  sunAz: 90,
  sunEl: h >= 30 ? 3 : -3,
  earthAz: 0,
  earthEl: 5,
}))
const terrain = { slopeMaxDeg: 3, slopeMeanDeg: 2, histogram500: [0, 0, 10, 0], elevationM: 0 }
const result = { data: { series }, profile: null, terrain, analysis: analyzeScenario(series, null) }
const REQ = { ...DEFAULT_REQUIREMENTS, batteryHours: 100 }
const samples = series.map((p) => ({ t: p.t }))

test('next Feasible moment: the first one where the Sun is up (and every requirement met)', () => {
  const cache = feasibleCache(result, REQ)
  assert.equal(findFeasibleIndex(result, REQ, samples, 0, 1, cache), 30)
  // From inside the good stretch, the next one is the next sample.
  assert.equal(findFeasibleIndex(result, REQ, samples, 40, 1, cache), 41)
})

test('previous Feasible moment, and null when there is none', () => {
  const cache = feasibleCache(result, REQ)
  assert.equal(findFeasibleIndex(result, REQ, samples, 50, -1, cache), 49)
  assert.equal(findFeasibleIndex(result, REQ, samples, 30, -1, cache), null) // before hour 30 the Sun is down
  const strict = { ...REQ, maxSlopeDeg: 1 } // the slope is never good enough
  assert.equal(findFeasibleIndex(result, strict, samples, 0, 1, feasibleCache(result, strict)), null)
})