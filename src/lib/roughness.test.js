import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  ROUGH_COLORS,
  ROUGH_FILL_FROM_M,
  ROUGH_FILL_MAX_ALPHA,
  ROUGH_FILL_TO_M,
  ROUGHNESS_GLSL,
  parseRoughness,
  roughnessAt,
  smoothRoughness,
} from './roughness.js'

function tiny() {
  // 4 x 4 cells of 500 m (a 2 km square), counts per meter 10: the top-left cell is 3.2 m, the bottom-right 12 m.
  const buffer = new ArrayBuffer(8 + 16)
  new Uint16Array(buffer, 0, 4).set([4, 500, 10, 25])
  const data = new Uint8Array(buffer, 8, 16)
  data[0] = 32
  data[15] = 120
  return parseRoughness(buffer)
}

test('parses the file and refuses a wrong size', () => {
  const r = tiny()
  assert.equal(r.n, 4)
  assert.equal(r.cellM, 500)
  assert.equal(r.data.length, 16)
  assert.throws(() => parseRoughness(new ArrayBuffer(10)), RangeError)
})

test('the value under a map point: top-left cell is north-west, rows run from the top', () => {
  const r = tiny() // span 2 km: x from -1 to 1, y from -1 to 1 (km)
  assert.equal(roughnessAt(r, -0.9, 0.9), 3.2)
  assert.equal(roughnessAt(r, 0.9, -0.9), 12)
  assert.equal(roughnessAt(r, 0, 0), 0)
  assert.equal(roughnessAt(r, 1.5, 0), null)
})

test('smoothing keeps a constant ground, spreads a spike and leaves the cells without data empty', () => {
  const n = 7
  const flat = { n, cellM: 500, countsPerM: 10, px: 25, data: new Uint8Array(n * n).fill(40) }
  assert.deepEqual([...smoothRoughness(flat).data], [...flat.data])
  const spike = { ...flat, data: new Uint8Array(n * n).fill(10) }
  spike.data[3 * n + 3] = 100
  const s = smoothRoughness(spike, 1)
  assert.ok(s.data[3 * n + 3] < 100 && s.data[3 * n + 3] > 10, 'the spike is averaged')
  assert.ok(s.data[3 * n + 4] > 10 && s.data[3 * n + 5] === 10, 'it reaches the neighbors only')
  const holes = { ...flat, data: new Uint8Array(n * n).fill(40) }
  holes.data[0] = 0
  const h = smoothRoughness(holes)
  assert.equal(h.data[0], 0)
  assert.equal(h.data[1], 40, 'the empty cell does not pull its neighbors down')
})

test('the layer is a faint veil that starts above the median', () => {
  assert.ok(ROUGH_FILL_FROM_M > 0.8, 'the smooth plains (median 0.79 m of the smoothed region) stay clear')
  assert.ok(ROUGH_FILL_TO_M > ROUGH_FILL_FROM_M)
  assert.ok(ROUGH_FILL_MAX_ALPHA <= 0.6, 'a veil: the other layers stay readable')
  for (const c of Object.values(ROUGH_COLORS)) assert.ok(c.length === 3 && c.every((v) => v >= 0 && v <= 1))
  assert.match(ROUGHNESS_GLSL, /vec4 roughFill\(vec2 uv\)/)
})

test('the committed file is a plausible roughness map of the region', () => {
  const buf = readFileSync(new URL('../../public/south-pole-roughness.bin', import.meta.url))
  const r = parseRoughness(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))
  assert.equal(r.cellM, 500)
  assert.ok(roughnessAt(r, 0, 0) !== null)
  assert.equal(roughnessAt(r, 400, 0), null)
})
