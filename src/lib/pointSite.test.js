import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AZIMUTHS, encodeHorizon } from './horizonGrid.js'
import { pointSite } from './pointSite.js'
import { latLonOf } from './polarSky.js'
import { MAP_RADIUS_KM, polarRadiusKm } from './polarMap.js'

// A 2.4 km-style terrain on a coarse 16 x 16 grid whose cells all have a 5 degree horizon and a 6 degree slope.
function makeTerrain(horizonDeg = 5, slopeDeg = 6) {
  const N = 16
  return {
    grid: N,
    heights: new Int16Array(N * N).fill(1200),
    slope: new Uint8Array(N * N).fill(slopeDeg),
    horizon: new Uint8Array(N * N * AZIMUTHS).fill(encodeHorizon(horizonDeg)),
  }
}

// A fine chunk centered 100 km from the pole toward lon 90: 4 x 4 cells of 2 km.
function makeChunk(horizonDeg, slopeDeg) {
  const cells = 4
  return {
    id: 'chunk',
    centerXKm: 100,
    centerYKm: 0,
    sizeKm: 8,
    cells,
    cellM: 2000,
    heights: new Int16Array(cells * cells).fill(-300),
    slope: new Uint8Array(cells * cells).fill(slopeDeg),
    horizon: new Uint8Array(cells * cells * AZIMUTHS).fill(encodeHorizon(horizonDeg)),
  }
}

const latOf100km = -90 + (2 * Math.atan(100 / (2 * 1737.4)) * 180) / Math.PI

test('a clicked point becomes a site with a 360-value horizon and slope statistics', () => {
  const s = pointSite(-86.2, 33.3, { terrain: makeTerrain() })
  assert.equal(s.custom, true)
  assert.equal(s.profile.length, 360)
  assert.ok(Math.abs(s.profile[123] - 5) < 0.3)
  assert.equal(s.terrainStats.slopeMaxDeg, 6)
  assert.equal(s.terrainStats.elevationM, 1200)
  assert.equal(s.terrainStats.histogram500.reduce((a, b) => a + b, 0), 9) // 3 x 3 cells around
  assert.equal(s.terrainStats.histogram500[6], 9)
  assert.match(s.id, /^point--86\.200_33\.300$/)
  assert.match(s.name, /86\.20°S 33\.3°E/)
  assert.ok(s.note.includes('2.4 km'))
})

test('a loaded fine chunk is preferred over the 2.4 km cell, and its values are used', () => {
  const chunk = makeChunk(2, 11)
  const s = pointSite(latOf100km, 90, { terrain: makeTerrain(), fineChunks: [chunk] })
  assert.equal(s.gridSource, '2000 m')
  assert.equal(s.terrainStats.slopeMaxDeg, 11)
  assert.equal(s.terrainStats.elevationM, -300)
  assert.ok(Math.abs(s.profile[0] - 2) < 0.3)
  const elsewhere = pointSite(-85, 200, { terrain: makeTerrain(), fineChunks: [chunk] }) // outside the chunk
  assert.equal(elsewhere.gridSource, '2.4 km')
})

test('no site outside the map or where there is no horizon data', () => {
  assert.equal(pointSite(-70, 0, { terrain: makeTerrain() }), null) // north of the 80 S circle
  const empty = makeTerrain()
  empty.horizon.fill(0)
  assert.equal(pointSite(-85, 10, { terrain: empty }), null)
})

test('longitude is wrapped and coordinates rounded to a thousandth of a degree', () => {
  const s = pointSite(-85.123456, -10.0004, { terrain: makeTerrain() })
  assert.equal(s.lat, -85.123)
  assert.equal(s.lon, 350) // -10.0004 wraps to 349.9996, rounded to 350.000
})

test('latLonOf turns a point of the scene into latitude and longitude', () => {
  const R = 1737.4
  const lat = (-85 * Math.PI) / 180
  const lon = (200 * Math.PI) / 180
  const p = [R * Math.cos(lat) * Math.cos(lon), R * Math.cos(lat) * Math.sin(lon), R * Math.sin(lat)]
  const out = latLonOf(p)
  assert.ok(Math.abs(out.lat + 85) < 1e-9 && Math.abs(out.lon - 200) < 1e-9)
  assert.ok(polarRadiusKm(-85) < MAP_RADIUS_KM)
})
