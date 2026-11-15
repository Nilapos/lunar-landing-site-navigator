import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cellAt, cellLabel, finestCell, latLonOfMapPoint, overviewCell, reticleSideKm } from './hoverCell.js'
import { MAP_RADIUS_KM } from './polarMap.js'

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`)

// A zone of 16 km around (10, -20), 128 cells (125 m), and a chunk of 16 km around (-100, 50), 32 cells (500 m).
const zone = { id: 'z', centerXKm: 10, centerYKm: -20, sizeKm: 16, cells: 128, grid: 128 }
const chunk = { centerXKm: -100, centerYKm: 50, sizeKm: 16, cells: 32, grid: 32, frames: { tag: 'chunk' } }

test('the cell of a zone under a point: rows run from the top, the center is the center of the cell', () => {
  const c = cellAt(zone, 10.01, -20.01) // just right of and below the center: cell (64, 64)
  assert.equal(c.i, 64)
  assert.equal(c.j, 64)
  assert.equal(c.index, 64 * 128 + 64)
  close(c.cx, 10 + 0.0625, 1e-9)
  close(c.cy, -20 - 0.0625, 1e-9)
  // The top-left cell: x at the left edge, y at the top edge.
  const first = cellAt(zone, 2.01, -12.01)
  assert.equal(first.index, 0)
  assert.equal(cellAt(zone, 20, -20), null)
  assert.equal(cellAt(zone, 10, -30), null)
})

test('the overview cell: center and side of a cell of the 2.4 km grid', () => {
  const width = 2 * MAP_RADIUS_KM
  const c = overviewCell(256, 0)
  close(c.sizeKm, width / 256, 1e-12)
  close(c.cx, -width / 2 + c.sizeKm / 2, 1e-9)
  close(c.cy, width / 2 - c.sizeKm / 2, 1e-9)
  const mid = overviewCell(256, 128 * 256 + 128) // the cell just right of and below the center
  close(mid.cx, c.sizeKm / 2, 1e-9)
  close(mid.cy, -c.sizeKm / 2, 1e-9)
})

test('the finest cell: the zone, then a chunk, then the overview', () => {
  const overview = { terrain: { grid: 256 }, frames: { tag: 'overview' }, grid: 256, index: 1000 }
  const inZone = finestCell(10.01, -20.01, { overview, zone: { zone, frames: { tag: 'zone' } }, chunks: [chunk] })
  assert.equal(inZone.level, 'zone')
  close(inZone.sizeKm, 0.125, 1e-12)
  assert.equal(inZone.frames.tag, 'zone')
  const inChunk = finestCell(-100.1, 50.1, { overview, zone: { zone, frames: { tag: 'zone' } }, chunks: [chunk] })
  assert.equal(inChunk.level, 'chunk')
  close(inChunk.sizeKm, 0.5, 1e-12)
  assert.equal(inChunk.frames.tag, 'chunk')
  const elsewhere = finestCell(100, 100, { overview, zone: { zone, frames: { tag: 'zone' } }, chunks: [chunk] })
  assert.equal(elsewhere.level, 'overview')
  assert.equal(elsewhere.index, 1000)
  // Without a shown zone the zone is not used, and the key changes only when the cell does.
  const a = finestCell(10.01, -20.01, { overview, zone: null, chunks: [] })
  assert.equal(a.level, 'overview')
  const k1 = finestCell(-100.1, 50.1, { overview, chunks: [chunk] }).key
  const k2 = finestCell(-100.15, 50.05, { overview, chunks: [chunk] }).key // the same 500 m cell
  const k3 = finestCell(-99.4, 50.1, { overview, chunks: [chunk] }).key // another one
  assert.equal(k1, k2)
  assert.notEqual(k1, k3)
})

test('the label of a cell size, and the reticle that never gets smaller than the pointer can aim at', () => {
  assert.equal(cellLabel(0.125), '125 m cell')
  assert.equal(cellLabel(0.5), '500 m cell')
  assert.equal(cellLabel(2.375), '2.4 km cell')
  // Far away a cell is a few pixels: the reticle is the size of 22 px. Close up it is the cell itself.
  const far = reticleSideKm(0.5, 800, 50, 600)
  close(far, (2 * 800 * Math.tan((25 * Math.PI) / 180) * 22) / 600, 1e-9)
  assert.ok(far > 20)
  assert.equal(reticleSideKm(0.5, 2, 50, 600), 0.5) // 2 km away, 22 px is only about 35 m: the cell itself
})

test('latitude and longitude of a point of the map plane', () => {
  const p = latLonOfMapPoint(0, 100)
  close(p.lon, 0, 1e-9)
  assert.ok(p.lat < -86 && p.lat > -88) // 100 km from the pole is about 3.3 degrees
  const q = latLonOfMapPoint(50, 0)
  close(q.lon, 90, 1e-9)
})
