import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDaysIso, formatDay, formatDuration, formatPercent, formatUtc } from './format.js'
import { niceTicks } from './scale.js'

const H = 3600000

test('formatDuration picks a readable unit', () => {
  assert.equal(formatDuration(null), '-')
  assert.equal(formatDuration(20 * 60000), '20 min')
  assert.equal(formatDuration(H), '1 h')
  assert.equal(formatDuration(5.5 * H), '5 h 30 min')
  assert.equal(formatDuration(8.9 * 24 * H), '8.9 days')
})

test('formatPercent and dates', () => {
  assert.equal(formatPercent(0.704), '70 %')
  const t = Date.UTC(2026, 10, 14, 3, 5)
  assert.equal(formatDay(t), 'Nov 14')
  assert.equal(formatUtc(t), 'Nov 14, 03:05 UT')
  assert.equal(addDaysIso('2026-11-14', 30), '2026-12-14')
  assert.equal(addDaysIso('2026-12-20', 15), '2027-01-04')
})

test('niceTicks covers the range with round values', () => {
  const ticks = niceTicks(-23.4, 6.1, 6)
  assert.ok(ticks[0] <= -23.4 && ticks[ticks.length - 1] >= 6.1)
  assert.ok(ticks.length <= 9)
  assert.ok(ticks.every((v) => Number.isInteger(v * 2)))
  assert.ok(niceTicks(0, 0, 5).length >= 1)
})
