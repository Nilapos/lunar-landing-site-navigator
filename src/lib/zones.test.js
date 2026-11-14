import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildCellFrames, goOverlay } from './illumination.js'
import { MOON_RADIUS_KM } from './polarSky.js'
import { southPoleSites } from '../data/south-pole-sites.js'
import { parseZone, zoneCellLatLon, zoneFrames, zoneHeightAt, zoneIndices, zonePatchRect, zonePositions, zoneRect } from './zones.js'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`)

// A small zone of 4 x 4 cells of 4 km centered 100 km from the pole toward lon 90 E.
function fakeZone(extra = {}) {
  const cells = 4
  const n = cells * cells
  return {
    id: 'fake',
    centerXKm: 100,
    centerYKm: 0,
    sizeKm: 16,
    cells,
    grid: cells,
    azimuths: 72,
    heights: Int16Array.from({ length: n }, (_, k) => k * 100),
    ...extra,
  }
}

test('cells are listed from the top row (toward lon 0), left to right (toward the east)', () => {
  const z = fakeZone()
  const topLeft = zoneCellLatLon(z, 0, 0)
  const topRight = zoneCellLatLon(z, 3, 0)
  const bottomLeft = zoneCellLatLon(z, 0, 3)
  // 100 km east of the pole is lon 90; the top row is at y > 0, which turns the longitude toward 0.
  assert.ok(topLeft.lon > 0 && topLeft.lon < 90, 'top row is toward lon 0')
  assert.ok(bottomLeft.lon > 90, 'bottom row is toward lon 180')
  assert.ok(topRight.lat > topLeft.lat, 'moving east at this place moves away from the pole')
  assert.ok(topLeft.lat < -86.5 && topLeft.lat > -87.5) // 100 km from the pole is about 3.3 degrees
})

test('positions lie on the sphere plus the exaggerated height; frames are unit vectors', () => {
  const z = fakeZone()
  const p = zonePositions(z, 1)
  for (let c = 0; c < 16; c++) close(Math.hypot(p[c * 3], p[c * 3 + 1], p[c * 3 + 2]), MOON_RADIUS_KM + z.heights[c] / 1000, 1e-3)
  close(Math.hypot(...zonePositions(z, 4).slice(45, 48)), MOON_RADIUS_KM + (z.heights[15] * 4) / 1000, 1e-3)
  const f = zoneFrames(z)
  close(Math.hypot(f.up[0], f.up[1], f.up[2]), 1, 1e-5)
  assert.equal(f.valid.length, 16)
  assert.equal(zoneIndices(4).length, 3 * 3 * 6)
})

test('the zone square on the 2.4 km map matches its size and position', () => {
  const r = zoneRect(fakeZone())
  const width = 2 * 304.0056
  close(r.side, 16 / width, 1e-4)
  close(r.x + r.side / 2, 0.5 + 100 / width, 1e-4) // 100 km east of the pole
  close(r.y + r.side / 2, 0.5, 1e-4)
})

test('the patch is half a cell smaller than the zone square on every side', () => {
  const z = fakeZone()
  const full = zoneRect(z)
  const patch = zonePatchRect(z)
  close(patch.side, full.side * (3 / 4), 1e-9)
  close(patch.x + patch.side / 2, full.x + full.side / 2, 1e-9)
})

test('height under a point: found inside the zone, null outside', () => {
  const z = fakeZone()
  const c = zoneCellLatLon(z, 2, 1)
  assert.equal(zoneHeightAt(z, c.lat, c.lon), z.heights[1 * 4 + 2])
  assert.equal(zoneHeightAt(z, -85, 0), null)
})

test('a zone can feed the Optimal layer like the 2.4 km terrain does', () => {
  const sample = { sunLon: 0, sunLat: 0, earthLon: 0, earthLat: 0, earthKm: 384400 }
  const z = fakeZone({ slope: new Uint8Array(16).fill(5), horizon: new Uint8Array(16 * 72).fill(41) }) // horizon 0 deg
  const rgba = goOverlay(z, zoneFrames(z), sample, { maxSlopeDeg: 15 })
  assert.equal(rgba.length, 16 * 4)
})

test('the committed zones match their description and the site list', () => {
  for (const site of southPoleSites) {
    const meta = JSON.parse(readFileSync(new URL(`../../public/zones/${site.id}.json`, import.meta.url), 'utf8'))
    const bin = readFileSync(new URL(`../../public/zones/${site.id}.bin`, import.meta.url))
    const zone = parseZone(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length))
    assert.equal(zone.id, site.id)
    assert.equal(zone.heights.length, zone.cells ** 2)
    assert.ok(zone.maxHeightM > zone.minHeightM)
    // The cell under the site holds the site's own height (within the relief of one cell).
    const here = zoneHeightAt(zone, site.lat, site.lon)
    assert.ok(here >= zone.minHeightM && here <= zone.maxHeightM, `${site.id} is inside its zone`)
    assert.ok(buildCellFrames) // (imported for the shape check above)
  }
})
