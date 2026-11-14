import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeBody, findWindows, horizonAt, stateAt, summarize } from './visibility.js'

const H = 3600000
const at = (hours, margin) => ({ t: hours * H, margin })

test('horizonAt interpolates and wraps around north', () => {
  const profile = Array.from({ length: 360 }, (_, i) => (i === 0 ? 10 : i === 359 ? 0 : 0))
  assert.equal(horizonAt(null, 123), 0)
  assert.equal(horizonAt(profile, 0), 10)
  assert.equal(horizonAt(profile, 359.5), 5) // halfway between az 359 (0) and az 0 (10)
})

test('findWindows interpolates crossings', () => {
  // margin goes -2 -> 2 between h0 and h1 (rise at 0.5h), then 2 -> -2 between h2 and h3 (set at 2.5h)
  const w = findWindows([at(0, -2), at(1, 2), at(2, 2), at(3, -2)])
  assert.equal(w.length, 1)
  assert.equal(w[0].start, 0.5 * H)
  assert.equal(w[0].end, 2.5 * H)
  assert.equal(w[0].startsOpen, false)
  assert.equal(w[0].endsOpen, false)
})

test('findWindows flags windows open at both ends', () => {
  const w = findWindows([at(0, 1), at(1, 1)])
  assert.deepEqual(w, [{ start: 0, end: H, startsOpen: true, endsOpen: true }])
})

test('summarize reports fraction and longest dark gap', () => {
  const samples = [at(0, -1), at(1, 1), at(2, 1), at(3, -1), at(4, -1), at(5, -1)]
  const windows = findWindows(samples)
  const s = summarize(samples, windows)
  assert.equal(s.windowCount, 1)
  assert.equal(s.visibleFraction, 2 / 5)
  assert.equal(s.longestGapMs, 2.5 * H) // from set at 3h-ish... trailing gap 2.5h, leading gap 0.5h
})

test('stateAt gives time to sunset / next sunrise', () => {
  const samples = [at(0, -1), at(1, 1), at(2, 1), at(3, -1)]
  const windows = findWindows(samples)
  assert.deepEqual(stateAt(samples, windows, 0), { visible: false, changeAt: 0.5 * H, remainingMs: 0.5 * H })
  assert.deepEqual(stateAt(samples, windows, 1.5 * H), { visible: true, changeAt: 2.5 * H, remainingMs: H })
  assert.deepEqual(stateAt(samples, windows, 2.9 * H), { visible: false, changeAt: null, remainingMs: null })
})

test('a terrain horizon shortens visibility', () => {
  const series = [
    { t: '2026-11-14T00:00:00Z', sunAz: 90, sunEl: 3 },
    { t: '2026-11-14T01:00:00Z', sunAz: 90, sunEl: 3 },
  ]
  const flat = analyzeBody(series, 'sun', null)
  const ridge = analyzeBody(series, 'sun', Array(360).fill(5)) // 5 degree ridge all around
  assert.equal(flat.summary.visibleFraction, 1)
  assert.equal(ridge.summary.visibleFraction, 0)
})
