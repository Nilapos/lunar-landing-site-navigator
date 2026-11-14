import assert from 'node:assert/strict'
import { test } from 'node:test'
import { azEl, localFrame, skyAt, unitVector } from './sky.js'

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`)
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

test('a body straight above a point is at 90 degrees elevation; on the opposite side it is at -90', () => {
  const f = localFrame(-86, 30)
  // asin is very sensitive near +-1, hence the loose tolerance (about 1e-4 degrees).
  close(azEl(f, f.up).el, 90, 1e-4, 'zenith')
  close(azEl(f, f.up.map((v) => -v)).el, -90, 1e-4, 'nadir')
})

test('azimuth: north is 0, east is 90', () => {
  const f = localFrame(10, 20)
  close(angleDiff(azEl(f, f.north).az, 0), 0, 1e-9, 'north')
  close(angleDiff(azEl(f, f.east).az, 90), 0, 1e-9, 'east')
  close(azEl(f, f.north).el, 0, 1e-9, 'horizon')
})

test('the sub-solar point sees the Sun at the zenith', () => {
  const sample = { sunLon: 126.6, sunLat: -1.56, earthLon: 358.8, earthLat: 4.4, earthKm: 405616 }
  close(skyAt(-1.56, 126.6, sample).sunEl, 90, 1e-4, 'Sun at its sub-solar point')
})

// Reference values from JPL Horizons itself (az/el of the Sun and the Earth from a point of the Moon),
// at 2026-11-14 00:00 UT, with the sub-points Horizons gives for the same instant. Checked to 0.001 degrees
// over 25 instants and four sites when the module was written; here two sites at one instant.
const SAMPLE = { earthLon: 358.77646, earthLat: 4.4033, sunLon: 126.617658, sunLat: -1.557279, earthKm: 405615.89143 }

test('matches Horizons az/el at Malapert', () => {
  const s = skyAt(-85.988, 2.053, SAMPLE)
  close(s.sunEl, -0.720862, 0.01, 'Sun el')
  close(angleDiff(s.sunAz, 124.58861), 0, 0.05, 'Sun az')
  close(s.earthEl, -0.643607, 0.01, 'Earth el')
  close(angleDiff(s.earthAz, 356.729261), 0, 0.05, 'Earth az')
})

test('matches Horizons az/el on the floor of Shackleton, where the Earth is near the horizon', () => {
  const s = skyAt(-89.6667, 129.7833, SAMPLE)
  close(s.sunEl, 1.889397, 0.01, 'Sun el')
  close(angleDiff(s.sunAz, 356.833614), 0, 0.05, 'Sun az')
  close(s.earthEl, -4.866857, 0.01, 'Earth el')
  close(angleDiff(s.earthAz, 229.0092), 0, 0.05, 'Earth az')
})

test('unitVector is a unit vector', () => {
  const v = unitVector(-45, 200)
  close(Math.hypot(...v), 1, 1e-12, 'length')
})
