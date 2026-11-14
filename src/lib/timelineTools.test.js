import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dayTicks, nearestIndex, STEP_UNITS, stepIndex } from './timelineTools.js'

// Three days of two-hourly samples.
const SAMPLES = Array.from({ length: 36 }, (_, k) => ({ t: new Date(Date.UTC(2026, 10, 14, 2 * k)).toISOString() }))
const DAY = STEP_UNITS.find((u) => u.key === 'day').ms
const HOUR = STEP_UNITS.find((u) => u.key === 'hour').ms

test('nearestIndex finds the closest sample', () => {
  assert.equal(nearestIndex(SAMPLES, Date.UTC(2026, 10, 14, 0)), 0)
  assert.equal(nearestIndex(SAMPLES, Date.UTC(2026, 10, 14, 5)), 3) // 05:00 is closer to 06:00 than 04:00? tie goes later
  assert.equal(nearestIndex(SAMPLES, Date.UTC(2026, 10, 14, 4, 30)), 2)
  assert.equal(nearestIndex(SAMPLES, Date.UTC(2030, 0, 1)), 35)
  assert.equal(nearestIndex(SAMPLES, Date.UTC(2000, 0, 1)), 0)
})

test('stepping moves by the unit, never leaves the series and always advances', () => {
  assert.equal(stepIndex(SAMPLES, 0, DAY, 1), 12)
  assert.equal(stepIndex(SAMPLES, 30, DAY, 1), 35)
  assert.equal(stepIndex(SAMPLES, 3, DAY, -1), 0)
  assert.equal(stepIndex(SAMPLES, 10, HOUR, 1), 11) // an hour is half a sample: still one sample forward
  assert.equal(stepIndex(SAMPLES, 10, HOUR, -1), 9)
  assert.equal(stepIndex(SAMPLES, 0, HOUR, -1), 0)
})

test('day marks start at the first sample of a day and are thinned out', () => {
  const ticks = dayTicks(SAMPLES, 8)
  assert.deepEqual(ticks.map((t) => t.index), [0, 12, 24])
  assert.equal(ticks[0].label, 'Nov 14')
  const many = Array.from({ length: 24 * 20 }, (_, k) => ({ t: new Date(Date.UTC(2026, 10, 1, k)).toISOString() }))
  assert.ok(dayTicks(many, 8).length <= 8)
})
