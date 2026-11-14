import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MOON_RADIUS_M, computeHorizonProfile, createDem, heightAt, toPixel } from './terrain.js'

// Small synthetic map: 401 x 401 pixels of 1000 m (+-200 km around the pole), heights in 0.5 m units.
function makeDem(fill) {
  const size = 401
  const data = new Int16Array(size * size)
  const dem = createDem(data, { size, scaleM: 1000 })
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) data[r * size + c] = fill(c, r, dem) / 0.5
  return dem
}

test('createDem rejects wrong sizes', () => {
  assert.throws(() => createDem(new Int16Array(10)), /Expected/)
})

test('toPixel: pole is the center, lon 0 is up, lon 90E is right', () => {
  const dem = makeDem(() => 0)
  assert.deepEqual(toPixel(dem, -90, 0), [200, 200])
  const [c0, r0] = toPixel(dem, -88, 0)
  assert.ok(Math.abs(c0 - 200) < 1e-6 && r0 < 200)
  const [c90, r90] = toPixel(dem, -88, 90)
  assert.ok(c90 > 200 && Math.abs(r90 - 200) < 1e-6)
})

test('heightAt interpolates and is NaN outside', () => {
  const dem = makeDem((c) => (c >= 200 ? 100 : 0))
  assert.equal(heightAt(dem, -90, 0), 100) // the pole is exactly at column 200
  // 500 m from the pole toward 270E (west) is column 199.5: halfway between 0 m and 100 m
  const lat = -90 + (2 * Math.atan(500 / (2 * MOON_RADIUS_M)) * 180) / Math.PI
  assert.ok(Math.abs(heightAt(dem, lat, 270) - 50) < 0.01)
  assert.ok(Number.isNaN(heightAt(dem, -60, 0)))
})

test('flat terrain gives a horizon of about 0 degrees', () => {
  const dem = makeDem(() => 0)
  const profile = computeHorizonProfile(dem, -88, 30, { maxDistanceM: 50000 })
  assert.equal(profile.length, 360)
  for (const e of profile) assert.ok(e <= 0.01 && e > -1, `elevation ${e}`)
})

test('a 1000 m wall 10 km to the north raises the northern horizon only', () => {
  // Observer at -88 / lon 0. The wall: all pixels within 1.5 km of the point 10 km north of it, 1000 m high.
  const base = makeDem(() => 0)
  const [oc, or] = toPixel(base, -88, 0)
  const wallRow = or - 10 // 10 pixels (10 km) toward lon 0 / north
  const dem = makeDem((c, r) => (Math.hypot(c - oc, r - wallRow) <= 1.5 ? 1000 : 0))
  const profile = computeHorizonProfile(dem, -88, 0, { maxDistanceM: 60000 })
  const expected = (Math.atan(1000 / 10000) * 180) / Math.PI // ~5.7 deg, minus ~0.3 deg of curvature
  assert.ok(profile[0] > expected - 0.8 && profile[0] <= expected, `north ${profile[0]} vs ${expected}`)
  assert.ok(profile[180] < 0.1, `south ${profile[180]}`)
  assert.ok(profile[90] < 0.1, `east ${profile[90]}`)
})
