import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { sampleHeight, slopeOverlayRgba } from './terrain3d.js'

function makeTerrain(grid, heightFn, slopeFn = () => 0) {
  const heights = new Int16Array(grid * grid)
  const slope = new Uint8Array(grid * grid)
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      heights[y * grid + x] = heightFn(x, y)
      slope[y * grid + x] = slopeFn(x, y)
    }
  }
  return { grid, heights, slope }
}

test('sampleHeight interpolates between cell centers and clamps at the edges', () => {
  const t = makeTerrain(4, (x) => x * 100) // 0, 100, 200, 300 along x
  assert.equal(sampleHeight(t, 0.375, 0.5), 100) // center of cell column 1 is at fraction (1 + 0.5) / 4
  assert.equal(sampleHeight(t, 0.5, 0.5), 150) // halfway between columns 1 and 2
  assert.equal(sampleHeight(t, 0, 0), 0) // clamped to the first center
  assert.equal(sampleHeight(t, 1, 1), 300)
})

test('slopeOverlayRgba marks only cells steeper than the limit, more opaque when steeper', () => {
  const t = makeTerrain(3, () => 0, (x) => [5, 16, 30][x])
  const rgba = slopeOverlayRgba(t, 15)
  const alpha = (x) => rgba[x * 4 + 3]
  assert.equal(alpha(0), 0) // 5 deg: fine
  assert.ok(alpha(1) > 0) // 16 deg: just over
  assert.ok(alpha(2) > alpha(1)) // 30 deg: steeper, more opaque
  assert.equal(rgba[1 * 4], 255) // red
})

test('the real 3D data files exist and match their description', () => {
  const meta = JSON.parse(readFileSync(new URL('../../public/south-pole-3d.json', import.meta.url), 'utf8'))
  const heights = readFileSync(new URL(`../../public/${meta.heightsFile}`, import.meta.url))
  const slope = readFileSync(new URL(`../../public/${meta.slopeFile}`, import.meta.url))
  assert.equal(heights.length, meta.grid ** 2 * 2)
  assert.equal(slope.length, meta.grid ** 2)
  assert.ok(Math.abs(meta.radiusKm - 304) < 0.5)
})
