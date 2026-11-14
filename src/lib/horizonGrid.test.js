import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AZIMUTHS, computeHorizonFast, decodeHorizon, encodeHorizon, horizonAtCell } from './horizonGrid.js'
import { computeHorizonProfile, createDem, heightAt } from './terrain.js'

function makeDem(fill) {
  const size = 401
  const data = new Int16Array(size * size)
  const dem = createDem(data, { size, scaleM: 1000 })
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) data[r * size + c] = fill(c, r, dem) / 0.5
  return dem
}

test('encode and decode keep the elevation to within one step', () => {
  for (const el of [-10, -3.3, 0, 0.1, 7.77, 25, 53.5]) {
    assert.ok(Math.abs(decodeHorizon(encodeHorizon(el)) - el) <= 0.125 + 1e-9, `elevation ${el}`)
  }
  assert.equal(encodeHorizon(-50), 1) // below the range: clamped (0 is reserved for "no data")
  assert.equal(encodeHorizon(90), 255)
})

test('horizonAtCell interpolates between stored azimuths and wraps around north', () => {
  const horizon = new Uint8Array(AZIMUTHS) // one cell
  horizon.fill(encodeHorizon(0))
  horizon[0] = encodeHorizon(10) // north
  horizon[AZIMUTHS - 1] = encodeHorizon(0)
  assert.ok(Math.abs(horizonAtCell(horizon, 0, 0) - 10) < 0.13)
  // Halfway between the last azimuth (0 deg) and north (10 deg).
  assert.ok(Math.abs(horizonAtCell(horizon, 0, 360 - 360 / AZIMUTHS / 2) - 5) < 0.2)
})

test('flat terrain gives a horizon near 0 degrees', () => {
  const dem = makeDem(() => 0)
  const h = computeHorizonFast(dem, -88, 30, 0, { maxDistanceM: 50000 })
  assert.equal(h.length, AZIMUTHS)
  for (const e of h) assert.ok(e <= 0.05 && e > -1, `elevation ${e}`)
})

test('a 1000 m wall 10 km to the north raises the northern horizon only', () => {
  const lat = -88
  const lon = 0
  // A site at longitude 0 sits above the pole on the map: its row is 200 minus its distance from the pole (1 km pixels).
  const rhoKm = 2 * 1737.4 * Math.tan(((lat + 90) * Math.PI) / 180 / 2)
  const siteRow = 200 - rhoKm
  // The wall: pixels within 1.5 km of the point 10 km north of the site (10 pixels up), 1000 m high.
  const dem = makeDem((c, r) => (Math.hypot(c - 200, r - (siteRow - 10)) <= 1.5 ? 1000 : 0))
  const h = computeHorizonFast(dem, lat, lon, heightAt(dem, lat, lon), { maxDistanceM: 60000 })
  const expected = (Math.atan(1000 / 10000) * 180) / Math.PI
  assert.ok(h[0] > expected - 0.9 && h[0] <= expected + 0.1, `north ${h[0]} vs ${expected}`)
  assert.ok(h[AZIMUTHS / 2] < 0.1, `south ${h[AZIMUTHS / 2]}`)
  assert.ok(h[AZIMUTHS / 4] < 0.1, `east ${h[AZIMUTHS / 4]}`)
})

test('the fast horizon agrees with the reference computation on a bumpy surface', () => {
  const dem = makeDem((c, r) => 800 * Math.sin(c / 9) * Math.cos(r / 7) + 300 * Math.sin((c + r) / 4))
  for (const [lat, lon] of [[-87, 40], [-85.5, 200], [-89, 300]]) {
    const ground = heightAt(dem, lat, lon)
    const fast = computeHorizonFast(dem, lat, lon, ground, { maxDistanceM: 120000 })
    const ref = computeHorizonProfile(dem, lat, lon, { maxDistanceM: 120000, stepM: 1000 })
    let worst = 0
    for (let k = 0; k < AZIMUTHS; k++) worst = Math.max(worst, Math.abs(fast[k] - ref[(k * 360) / AZIMUTHS]))
    assert.ok(worst < 0.6, `site ${lat}, ${lon}: worst difference ${worst.toFixed(2)} degrees`)
  }
})
