import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { AZIMUTHS, encodeHorizon } from './horizonGrid.js'
import { buildCellFrames, visibilityOverlay } from './illumination.js'

// A 4 x 4 grid whose cells all have the same horizon (flat = 0 degrees, or a wall of 30 degrees).
function makeTerrain(horizonDeg) {
  const N = 4
  const horizon = new Uint8Array(N * N * AZIMUTHS).fill(encodeHorizon(horizonDeg))
  return { grid: N, horizon }
}
const alpha = (rgba, cell) => rgba[cell * 4 + 3]
const isWarm = (rgba, cell) => rgba[cell * 4] === 255 && rgba[cell * 4 + 2] === 70 // sunlit color

// Sun over the equator at longitude 0: cells at the top of the map (lon 0 side) see it low above the horizon,
// cells at the bottom (lon 180 side) have it below the horizon.
const SAMPLE = { sunLon: 0, sunLat: 0, earthLon: 0, earthLat: 0, earthKm: 384400 }
const TOP_MIDDLE = 1 // row 0, column 1
const BOTTOM_MIDDLE = 13 // row 3, column 1

test('sunlit on the side facing the Sun, in shadow on the far side', () => {
  const t = makeTerrain(0)
  const frames = buildCellFrames(t)
  const rgba = visibilityOverlay(t, frames, SAMPLE, { sun: true, earth: false })
  assert.ok(isWarm(rgba, TOP_MIDDLE), 'near side is lit')
  assert.ok(!isWarm(rgba, BOTTOM_MIDDLE) && alpha(rgba, BOTTOM_MIDDLE) > 0, 'far side is in shadow')
})

test('a high terrain horizon puts the near side in shadow too, and a minimum elevation does the same', () => {
  const walled = makeTerrain(30)
  const rgba = visibilityOverlay(walled, buildCellFrames(walled), SAMPLE, { sun: true, earth: false })
  assert.ok(!isWarm(rgba, TOP_MIDDLE))
  const flat = makeTerrain(0)
  const strict = visibilityOverlay(flat, buildCellFrames(flat), SAMPLE, { sun: true, earth: false, minSunDeg: 60 })
  assert.ok(!isWarm(strict, TOP_MIDDLE))
})

test('layers are optional: nothing is painted when both are off, and the Earth layer alone leaves shadows out', () => {
  const t = makeTerrain(0)
  const frames = buildCellFrames(t)
  const none = visibilityOverlay(t, frames, SAMPLE, { sun: false, earth: false })
  assert.ok(none.every((v) => v === 0))
  const earthOnly = visibilityOverlay(t, frames, SAMPLE, { sun: false, earth: true })
  // The Earth at the equator, lon 0 is seen from the near-side cells only.
  assert.ok(alpha(earthOnly, TOP_MIDDLE) > 0)
  assert.equal(alpha(earthOnly, BOTTOM_MIDDLE), 0)
})

test('cells without horizon data stay empty', () => {
  const t = makeTerrain(0)
  t.horizon.fill(0, 0, AZIMUTHS) // cell 0 has no data
  const rgba = visibilityOverlay(t, buildCellFrames(t), SAMPLE)
  assert.equal(alpha(rgba, 0), 0)
})

test('the real horizon file exists and matches its description', () => {
  const meta = JSON.parse(readFileSync(new URL('../../public/south-pole-3d.json', import.meta.url), 'utf8'))
  const horizon = readFileSync(new URL(`../../public/${meta.horizon.file}`, import.meta.url))
  assert.equal(meta.horizon.azimuths, AZIMUTHS)
  assert.equal(horizon.length, meta.grid ** 2 * AZIMUTHS)
  assert.ok(horizon.some((b) => b > 0))
})
