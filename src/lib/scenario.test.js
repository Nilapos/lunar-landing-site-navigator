import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeScenario, compareScenarios } from './scenario.js'

const H = 3600000
const t0 = Date.UTC(2026, 10, 14)
const at = (hours) => new Date(t0 + hours * H).toISOString()

// Hours 0-3: Sun up (2 deg). Hours 3-6: Sun down. Earth up (3 deg) from hour 2 to 5.
function makeSeries() {
  return Array.from({ length: 7 }, (_, h) => ({
    t: at(h),
    sunAz: 0,
    sunEl: h <= 2 ? 2 : -2,
    earthAz: 0,
    earthEl: h >= 2 && h <= 4 ? 3 : -3,
  }))
}

test('analyzeScenario gives Sun, Earth and combined windows', () => {
  const a = analyzeScenario(makeSeries(), null)
  assert.equal(a.sun.windows.length, 1)
  assert.equal(a.earth.windows.length, 1)
  assert.equal(a.both.windows.length, 1)
  // Combined window is the overlap, which is shorter than either window alone.
  assert.ok(a.both.summary.longestWindowMs < a.sun.summary.longestWindowMs)
  assert.ok(a.both.summary.longestWindowMs < a.earth.summary.longestWindowMs)
})

test('a higher minimum elevation can remove visibility', () => {
  const loose = analyzeScenario(makeSeries(), null, { minSunDeg: 0 })
  const strict = analyzeScenario(makeSeries(), null, { minSunDeg: 5 }) // Sun only reaches 2 deg
  assert.ok(loose.sun.summary.visibleFraction > 0)
  assert.equal(strict.sun.summary.visibleFraction, 0)
  assert.equal(strict.both.summary.visibleFraction, 0)
})

test('compareScenarios says which side is better, in the right direction', () => {
  const good = analyzeScenario(makeSeries(), null)
  const bad = analyzeScenario(makeSeries(), null, { minSunDeg: 5 })
  const rows = compareScenarios(good, bad)
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
  assert.equal(byKey.sunLit.better, 'a') // more sunlight is better
  assert.equal(byKey.sunDark.better, 'a') // longer darkness is worse, so A (shorter) wins
  assert.ok(byKey.sunLit.delta < 0)
  assert.equal(compareScenarios(good, good).every((r) => r.better === 'same'), true)
})
