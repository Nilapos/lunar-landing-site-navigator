import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { chunkAsZone, chunksNear, decodeChunk, gunzip } from './fineGrid.js'
import { mapXY } from './polarSky.js'
import { zoneCellLatLon, zoneRect } from './zones.js'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`)

// A tiny grid: 4 x 4 chunks of 4 x 4 cells of 500 m (so chunks of 2 km, a span of 8 km).
const INDEX = {
  cellM: 500,
  chunkCells: 4,
  chunksPerSide: 4,
  cells: 16,
  spanKm: 8,
  azimuths: 72,
  slopeOffset: 4 * 4 * 2,
  horizonOffset: 4 * 4 * 3,
  chunks: [[0, 0], [0, 1], [1, 1], [2, 2], [3, 3]],
}

test('a chunk is a square of the map plane, top row first', () => {
  const z = chunkAsZone(INDEX, 0, 0)
  assert.equal(z.sizeKm, 2) // 4 cells of 0.5 km
  close(z.centerXKm, -3) // the first chunk of an 8 km span: x from -4 to -2
})

test('chunk centers tile the span without gaps', () => {
  const a = chunkAsZone(INDEX, 1, 1)
  const b = chunkAsZone(INDEX, 1, 2)
  close(b.centerXKm - a.centerXKm, INDEX.spanKm / INDEX.chunksPerSide) // one chunk to the east
  const c = chunkAsZone(INDEX, 2, 1)
  close(a.centerYKm - c.centerYKm, INDEX.spanKm / INDEX.chunksPerSide) // one chunk down is toward lon 180
  const first = chunkAsZone(INDEX, 0, 0)
  close(first.centerXKm, -INDEX.spanKm / 2 + INDEX.spanKm / INDEX.chunksPerSide / 2)
  close(first.centerYKm, INDEX.spanKm / 2 - INDEX.spanKm / INDEX.chunksPerSide / 2)
})

test('decoding splits the tables and undoes the delta coding of the horizon', () => {
  const n = 16
  const raw = new Uint8Array(INDEX.horizonOffset + n * 72)
  const heights = new Int16Array(raw.buffer, 0, n)
  heights.forEach((_, k) => (heights[k] = k * 10 - 50))
  raw.fill(7, INDEX.slopeOffset, INDEX.slopeOffset + n)
  // Cell 0: horizon 10, 12, 12, 11, ... stored as differences 10, 2, 0, 255 (-1 modulo 256)
  const horizon = new Uint8Array(raw.buffer, INDEX.horizonOffset, n * 72)
  horizon.set([10, 2, 0, 255], 0)
  const chunk = decodeChunk(INDEX, 0, 1, raw.buffer)
  assert.equal(chunk.grid, 4)
  assert.equal(chunk.heights[3], -20)
  assert.equal(chunk.slope[5], 7)
  assert.deepEqual([...chunk.horizon.slice(0, 4)], [10, 12, 12, 11])
  assert.equal(chunk.horizon[71], 11) // the rest of the cell keeps the last value (zero differences)
  assert.equal(chunk.frames.valid.length, n)
  assert.throws(() => decodeChunk(INDEX, 0, 1, new ArrayBuffer(10)))
})

test('a chunk works as a zone: its cells fall inside its square on the map', () => {
  const z = chunkAsZone(INDEX, 2, 2)
  const rect = zoneRect(z)
  assert.ok(rect.x > 0 && rect.x + rect.side < 1 && rect.y > 0 && rect.y + rect.side < 1)
  const { lat, lon } = zoneCellLatLon(z, 0, 0)
  assert.ok(lat < -89 && lat > -90 && lon >= 0 && lon < 360)
})

test('the chunks nearest to a point come first, and only existing chunks', () => {
  assert.ok(chunksNear(INDEX, 15, 15, 10).length <= INDEX.chunks.length)
  const near = chunksNear(INDEX, chunkAsZone(INDEX, 3, 3).centerXKm, chunkAsZone(INDEX, 3, 3).centerYKm, 2)
  assert.deepEqual(near[0], [3, 3])
  assert.equal(near.length, 2)
  assert.equal(chunksNear(INDEX, 0, 0, 1).length, 1)
})

test('gunzip opens a gzip buffer and leaves anything else alone', async () => {
  const data = Uint8Array.from([1, 2, 3, 4, 5, 250])
  const zipped = gzipSync(data)
  const out = new Uint8Array(await gunzip(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.length)))
  assert.deepEqual([...out], [...data])
  const plain = new Uint8Array(await gunzip(data.buffer))
  assert.deepEqual([...plain], [...data])
})

test('a point of the scene becomes a point of the map plane', () => {
  const R = 1737.4
  const lat = (-89 * Math.PI) / 180
  const lon = (90 * Math.PI) / 180
  const p = [R * Math.cos(lat) * Math.cos(lon), R * Math.cos(lat) * Math.sin(lon), R * Math.sin(lat)]
  const { x, y } = mapXY(p)
  assert.ok(x > 0 && Math.abs(y) < 1e-6, 'lon 90 is east')
  close(Math.hypot(x, y), 2 * R * Math.tan((1 * Math.PI) / 360), 1e-6) // 1 degree from the pole
  const south = mapXY([0, 0, -R])
  close(south.x, 0, 1e-9)
  close(south.y, 0, 1e-9)
})
