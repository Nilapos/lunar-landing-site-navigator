import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDaysIso, addMinutesIso, showDateTime } from './format.js'
import { analyzeScenario } from './scenario.js'
import { fractionSteeperThan, levelFromRatio, marginScore, scoreLevel } from './scores.js'
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

// Flat terrain by default: max slope 2 degrees; 10 histogram bins of 1 degree (all in the 1-2 degree bin).
const FLAT = { elevationM: 0, slopeMeanDeg: 1, slopeMaxDeg: 2, histogram500: [0, 100, ...new Array(44).fill(0)] }

const evaluate = (s, req = {}, terrain = FLAT) =>
  evaluateScenario(analyzeScenario(s, null), { ...DEFAULT_REQUIREMENTS, ...req }, t0, terrain)
const level = (ev, key) => ev.items.find((i) => i.key === key).level
const score = (ev, key) => ev.items.find((i) => i.key === key).score

test('margin score: 50 when the requirement is just met, 100 at twice the margin', () => {
  assert.equal(marginScore(1), 50)
  assert.equal(marginScore(2), 100)
  assert.equal(marginScore(5), 100)
  assert.equal(marginScore(0), 0)
  assert.equal(marginScore(Infinity), 100)
  assert.equal(marginScore(1.2), 60)
})

test('levels from a ratio and from a score agree', () => {
  for (const r of [0, 0.5, 0.99, 1, 1.1, 1.19, 1.2, 1.5, 3]) {
    assert.equal(scoreLevel(marginScore(r)), levelFromRatio(r), `ratio ${r}`)
  }
})

test('fractionSteeperThan counts histogram bins from the limit up', () => {
  const hist = new Array(46).fill(0)
  hist[3] = 50
  hist[16] = 25
  hist[30] = 25
  assert.equal(fractionSteeperThan(hist, 15), 0.5)
  assert.equal(fractionSteeperThan(hist, 15.5), 0.5) // rounds up to bin 16
  assert.equal(fractionSteeperThan(hist, 0), 1)
  assert.equal(fractionSteeperThan(new Array(46).fill(0), 10), 0)
})

test('everything visible all the time on flat ground is feasible with high scores', () => {
  const ev = evaluate(series(100, () => 3, () => 3))
  assert.equal(ev.overall, 'ok')
  assert.equal(ev.scores.solar, 100)
  assert.ok(ev.scores.global >= 90)
})

test('power: darkness longer than the battery autonomy fails, close to it warns', () => {
  // Sun up for the first 10 h, then dark for 90 h.
  const s = series(100, (h) => (h < 10 ? 3 : -3), () => 3)
  assert.equal(level(evaluate(s, { batteryHours: 72 }), 'power'), 'fail')
  assert.equal(level(evaluate(s, { batteryHours: 100 }), 'power'), 'warn') // ratio 1.11
  assert.equal(level(evaluate(s, { batteryHours: 200 }), 'power'), 'ok')
  assert.equal(score(evaluate(s, { batteryHours: 90.5 }), 'power'), 50) // darkness is 90.5 h (interpolated): just met
})

test('power: a Sun that never rises fails with a score of 0', () => {
  const ev = evaluate(series(10, () => -3, () => 3))
  assert.equal(level(ev, 'power'), 'fail')
  assert.equal(ev.scores.solar, 0)
})

test('comms: required minutes per hour against Earth visibility', () => {
  // Earth visible half of the time = 30 min per hour.
  const s = series(100, () => 3, (h) => (h < 50 ? 3 : -3))
  assert.equal(level(evaluate(s, { linkMinPerHour: 40 }), 'comms'), 'fail')
  assert.equal(level(evaluate(s, { linkMinPerHour: 28 }), 'comms'), 'warn') // 30 / 28 = 1.07
  assert.equal(level(evaluate(s, { linkMinPerHour: 10 }), 'comms'), 'ok')
})

test('comms: the antenna class must carry the required data rate', () => {
  const s = series(100, () => 3, () => 3)
  assert.equal(level(evaluate(s, { antenna: 'lga', bandwidthKbps: 256 }), 'comms'), 'fail') // LGA ~2 kbps
  assert.equal(level(evaluate(s, { antenna: 'hga', bandwidthKbps: 256 }), 'comms'), 'ok')
})

test('landing window: not visible at landing fails; remaining time against the sequence length', () => {
  const darkAtLanding = series(100, (h) => (h < 5 ? -3 : 3), () => 3)
  assert.equal(level(evaluate(darkAtLanding), 'window'), 'fail')
  // Sun sets 30 min after landing (crossing interpolated between the h0 and h1 samples).
  const shortWindow = series(100, (h) => (h === 0 ? 3 : -3), () => 3)
  assert.equal(level(evaluate(shortWindow, { landingMinutes: 40 }), 'window'), 'fail') // 30 < 40
  assert.equal(level(evaluate(shortWindow, { landingMinutes: 28 }), 'window'), 'warn') // 30 / 28 = 1.07
  assert.equal(level(evaluate(shortWindow, { landingMinutes: 5 }), 'window'), 'ok')
})

test('terrain: steepest slope against the rover limit', () => {
  const s = series(100, () => 3, () => 3)
  const steep = { ...FLAT, slopeMaxDeg: 20, histogram500: [...new Array(20).fill(0), 100, ...new Array(25).fill(0)] }
  assert.equal(level(evaluate(s, { maxSlopeDeg: 15 }, steep), 'terrain'), 'fail')
  assert.equal(level(evaluate(s, { maxSlopeDeg: 15 }, FLAT), 'terrain'), 'ok')
  assert.equal(level(evaluate(s, { maxSlopeDeg: 21 }, steep), 'terrain'), 'warn') // 21 / 20 = 1.05
})

test('overall is the worst item; global score is the average of the four', () => {
  const ev = evaluate(series(100, () => -3, () => 3)) // no Sun
  assert.equal(ev.overall, 'fail')
  const { solar, telecom, window, topography, global } = ev.scores
  assert.equal(global, Math.round((solar + telecom + window + topography) / 4))
})

test('landing window: when not visible at landing, says how far to shift to reach the next window', () => {
  const darkAtLanding = series(100, (h) => (h < 5 ? -3 : 3), () => 3)
  const item = evaluate(darkAtLanding).items.find((i) => i.key === 'window')
  assert.ok(item.shiftMs > 4 * H && item.shiftMs < 5 * H) // Sun rises between hour 4 and 5
  const visible = evaluate(series(100, () => 3, () => 3)).items.find((i) => i.key === 'window')
  assert.equal(visible.shiftMs, undefined)
})

test('date helpers keep the input shape', () => {
  assert.equal(addMinutesIso('2026-11-14T23:30', 45), '2026-11-15T00:15')
  assert.equal(addMinutesIso('2026-11-14', 90), '2026-11-14T01:30')
  assert.equal(addDaysIso('2026-11-14T08:30', 2), '2026-11-16T08:30')
  assert.equal(addDaysIso('2026-11-14', 2), '2026-11-16')
  assert.equal(showDateTime('2026-11-14T08:30'), '2026-11-14 08:30')
})

// --- Energy balance (energy.js): a fifth gauge when the vehicles have power specs, never part of the global score ---

const ENERGY_SPECS = {
  panelAreaM2: 2,
  panelEfficiency: 0.3,
  chargeEfficiency: 0.9,
  batteryWh: 2000,
  consumption: { operatingW: 100, survivalW: 20, operatingHoursPerDay: 6 },
  panel: { mode: 'vertical-tracking' },
}
const withSun = (s) => s.map((p) => ({ ...p, sunDeltaAu: 1, sunAngDiamArcsec: 1920 }))

test('without power specs there is no energy item, and the scores are what they were', () => {
  const s = withSun(series(48, () => 10, () => 10))
  const ev = evaluate(s)
  assert.equal(ev.items.some((i) => i.key === 'energy'), false)
  assert.equal(ev.scores.energy, undefined)
})

test('with power specs: an energy item and score, the global score stays the average of the four others', () => {
  const s = withSun(series(48, () => 10, () => 10))
  const plain = evaluate(s)
  const ev = evaluate(s, { energy: { lander: ENERGY_SPECS, rover: null } })
  const item = ev.items.find((i) => i.key === 'energy')
  assert.ok(item.ratio > 1.2, `ratio ${item.ratio}`)
  assert.equal(item.level, 'ok')
  assert.equal(ev.scores.energy, item.score)
  assert.equal(ev.scores.global, plain.scores.global)
  assert.match(item.detail, /lander: .* stored per day vs .* needed/)
})

test('a vehicle that cannot feed itself makes the energy item fail, and the worst of two vehicles counts', () => {
  const s = withSun(series(48, () => 10, () => 10))
  const starving = { ...ENERGY_SPECS, panelAreaM2: 0.01 }
  const ev = evaluate(s, { energy: { lander: ENERGY_SPECS, rover: starving } })
  assert.equal(level(ev, 'energy'), 'fail')
  assert.equal(ev.overall, 'fail') // it blocks the site even though the global score is untouched
  const detail = ev.items.find((i) => i.key === 'energy').detail
  assert.match(detail, /lander: /)
  assert.match(detail, /rover: /)
})

test('a series without the Sun distance gives no energy item rather than an invented one', () => {
  const ev = evaluate(series(48, () => 10, () => 10), { energy: { lander: ENERGY_SPECS, rover: null } })
  assert.equal(ev.items.some((i) => i.key === 'energy'), false)
})
