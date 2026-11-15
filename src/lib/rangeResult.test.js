import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateFromMoment } from './momentScores.js'
import { restrictToRange } from './rangeResult.js'
import { analyzeScenario } from './scenario.js'
import { DEFAULT_REQUIREMENTS } from './verdict.js'

const HOUR = 3600000
const T0 = Date.UTC(2026, 10, 14)
const PROFILE = new Array(360).fill(0)

// 20 days, hourly. The Sun and the Earth are up for the first 10 days, then both are down for the last 10 days (a long night).
function makeResult() {
  const series = Array.from({ length: 20 * 24 + 1 }, (_, h) => {
    const up = h < 10 * 24
    return { t: new Date(T0 + h * HOUR).toISOString(), sunAz: 0, sunEl: up ? 5 : -5, earthAz: 0, earthEl: up ? 5 : -5 }
  })
  const req = { ...DEFAULT_REQUIREMENTS, batteryHours: 48, minSunDeg: 0, minEarthDeg: 0 }
  const analysis = analyzeScenario(series, PROFILE, { minSunDeg: 0, minEarthDeg: 0 })
  return { result: { data: { series }, profile: PROFILE, terrain: { slopeMeanDeg: 2, slopeMaxDeg: 5, histogram500: new Array(30).fill(0).map((_, i) => (i === 2 ? 10 : 0)) }, analysis }, req }
}

test('the whole range gives the result back unchanged', () => {
  const { result, req } = makeResult()
  assert.equal(restrictToRange(result, req, result.data.series), result)
  assert.equal(restrictToRange(result, req, null), result)
})

test('a narrower range cuts the series and analyses only it', () => {
  const { result, req } = makeResult()
  const range = result.data.series.slice(24, 5 * 24) // days 1 to 5, all in the lit part
  const cut = restrictToRange(result, req, range)
  assert.equal(cut.data.series.length, range.length)
  assert.equal(cut.data.series[0].t, range[0].t)
  assert.equal(cut.data.series.at(-1).t, range.at(-1).t)
  assert.equal(cut.analysis.sun.summary.visibleFraction, 1) // the whole range is lit
  assert.ok(result.analysis.sun.summary.visibleFraction < 1) // the whole period is not
  assert.equal(cut.profile, result.profile)
})

test('a landing is judged to the end of the range: a night after the range does not count', () => {
  const { result, req } = makeResult()
  const range = result.data.series.slice(0, 8 * 24) // days 0 to 8: the long night (days 10 to 20) is outside
  const landing = Date.parse(range[24].t)
  const whole = evaluateFromMoment(result, req, landing)
  const cut = evaluateFromMoment(restrictToRange(result, req, range), req, landing)
  const power = (ev) => ev.items.find((i) => i.key === 'power')
  assert.ok(power(whole).ratio < 1, 'with the whole period, the night of 10 days is held against the landing')
  assert.ok(power(cut).ratio >= 1, 'inside the range, there is no night: the requirement is met')
})
