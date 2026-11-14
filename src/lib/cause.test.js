import assert from 'node:assert/strict'
import { test } from 'node:test'
import { causeSegments, classifyCause, skyTrack } from './cause.js'

const flat = new Array(360).fill(0)
const ridge = new Array(360).fill(3) // a 3 degree ridge all around
const iso = (h) => new Date(Date.UTC(2026, 10, 14, h)).toISOString()
const point = (h, el, az = 90) => ({ t: iso(h), sunEl: el, sunAz: az })

test('visible beats the other causes, even just under the flat horizon on a summit', () => {
  assert.equal(classifyCause(2, 0), 'visible')
  assert.equal(classifyCause(-0.5, -1.4), 'visible') // summit: the horizon itself is below 0
  assert.equal(classifyCause(2, 5), 'terrain') // above the flat horizon, behind a ridge
  assert.equal(classifyCause(-2, 0), 'below')
  assert.equal(classifyCause(2, 0, 5), 'terrain') // not high enough for the rover's minimum elevation
})

test('segments merge consecutive samples of the same cause', () => {
  const series = [point(0, -2), point(1, -1), point(2, 1), point(3, 2), point(4, 5), point(5, 4)]
  const segments = causeSegments(series, 'sun', ridge)
  assert.deepEqual(segments.map((s) => s.cause), ['below', 'terrain', 'visible'])
  assert.equal(segments[0].start, Date.parse(iso(0)))
  assert.equal(segments[0].end, Date.parse(iso(2))) // runs until the next one starts
  assert.equal(segments[2].end, Date.parse(iso(5)))
  assert.deepEqual(causeSegments(series, 'sun', flat).map((s) => s.cause), ['below', 'visible'])
})

test('the sky track is cut at visibility changes (sharing the crossing) and at the azimuth wrap', () => {
  const series = [point(0, 1, 100), point(1, 4, 110), point(2, 5, 120), point(3, 1, 359), point(4, 1, 2)]
  const track = skyTrack(series, 'sun', ridge)
  assert.deepEqual(track.map((s) => s.visible), [false, true, false, false])
  assert.equal(track[1].points.length, 3) // the previous sample is shared, so the line has no gap
  assert.equal(track[1].points[0].t, Date.parse(iso(0)))
  // 120 -> 359 and 359 -> 2 both jump by more than 180 degrees: treated as wraps, no shared point.
  assert.equal(track[3].points.length, 1)
})
