import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDaysIso, showDateTime } from './format.js'
import { analyzeScenario } from './scenario.js'
import { DEFAULT_REQUIREMENTS, evaluateScenario } from './verdict.js'

const H = 3600000
const t0 = Date.UTC(2026, 10, 14)

// Hourly series over `hours`; sunEl / earthEl are functions of the hour.
function series(hours, sunEl, earthEl) {
  return Array.from({ length: hours + 1 }, (_, h) => ({
    t: new Date(t0 + h * H).toISOString(),
    sunAz: 0,
    sunEl: sunEl(h),
    earthAz: 0,
    earthEl: earthEl(h),
  }))
}
const evaluate = (s, req = {}) => evaluateScenario(analyzeScenario(s, null), { ...DEFAULT_REQUIREMENTS, ...req }, t0)
const level = (ev, key) => ev.items.find((i) => i.key === key).level

test('everything visible all the time is feasible', () => {
  const ev = evaluate(series(100, () => 3, () => 3))
  assert.equal(ev.overall, 'ok')
})

test('power: darkness longer than the battery autonomy fails, close to it warns', () => {
  // Sun up for the first 10 h, then dark for 90 h.
  const s = series(100, (h) => (h < 10 ? 3 : -3), () => 3)
  assert.equal(level(evaluate(s, { batteryHours: 72 }), 'power'), 'fail')
  assert.equal(level(evaluate(s, { batteryHours: 100 }), 'power'), 'warn') // 90 h > 80% of 100 h
  assert.equal(level(evaluate(s, { batteryHours: 200 }), 'power'), 'ok')
})

test('power: a Sun that never rises fails', () => {
  assert.equal(level(evaluate(series(10, () => -3, () => 3)), 'power'), 'fail')
})

test('comms: required minutes per hour against Earth visibility', () => {
  // Earth visible half of the time = 30 min per hour.
  const s = series(100, () => 3, (h) => (h < 50 ? 3 : -3))
  assert.equal(level(evaluate(s, { linkMinPerHour: 40 }), 'comms'), 'fail')
  assert.equal(level(evaluate(s, { linkMinPerHour: 28 }), 'comms'), 'warn') // 30 < 28 * 1.2
  assert.equal(level(evaluate(s, { linkMinPerHour: 10 }), 'comms'), 'ok')
})

test('landing window: not visible at landing fails; short window warns', () => {
  const darkAtLanding = series(100, (h) => (h < 5 ? -3 : 3), () => 3)
  assert.equal(level(evaluate(darkAtLanding), 'window'), 'fail')
  // Sun sets 30 min after landing (crossing interpolated between the h0 and h1 samples).
  const shortWindow = series(100, (h) => (h === 0 ? 3 : -3), () => 3)
  assert.equal(level(evaluate(shortWindow, { landingMinutes: 15 }), 'window'), 'warn') // 30 min < 3 x 15 min
  assert.equal(level(evaluate(shortWindow, { landingMinutes: 40 }), 'window'), 'fail') // 30 min < 40 min
  assert.equal(level(evaluate(shortWindow, { landingMinutes: 5 }), 'window'), 'ok') // 30 min >= 3 x 5 min
})

test('overall is the worst of the three', () => {
  const s = series(100, () => -3, () => 3) // no Sun
  assert.equal(evaluate(s).overall, 'fail')
})

test('date helpers keep the input shape', () => {
  assert.equal(addDaysIso('2026-11-14T08:30', 2), '2026-11-16T08:30')
  assert.equal(addDaysIso('2026-11-14', 2), '2026-11-16')
  assert.equal(showDateTime('2026-11-14T08:30'), '2026-11-14 08:30')
})
