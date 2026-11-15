import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { AZIMUTHS, encodeHorizon } from './horizonGrid.js'
import { buildCellFrames, goFractionOverlay, goFractions, goOverlay, visibilityOverlay } from './illumination.js'
import { OPTIMAL_RGB } from './layerColors.js'

// A 4 x 4 grid whose cells all have the same horizon (flat = 0 degrees, or a wall of 30 degrees).
function makeTerrain(horizonDeg, slopeDeg = 5) {
  const N = 4
  const horizon = new Uint8Array(N * N * AZIMUTHS).fill(encodeHorizon(horizonDeg))
  return { grid: N, horizon, slope: new Uint8Array(N * N).fill(slopeDeg) }
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

const isOptimal = (rgba, cell) => OPTIMAL_RGB.every((v, k) => rgba[cell * 4 + k] === v) // the color of the Optimal layer (layerColors.js)
const REQ = { minSunDeg: 0, minEarthDeg: 0, maxSlopeDeg: 15 }

test('Optimal layer: colored only where slope, Sun and Earth are all fine', () => {
  const t = makeTerrain(0, 5)
  const frames = buildCellFrames(t)
  const rgba = goOverlay(t, frames, SAMPLE, REQ)
  assert.ok(isOptimal(rgba, TOP_MIDDLE), 'flat, Sun and Earth up: good')
  assert.ok(!isOptimal(rgba, BOTTOM_MIDDLE) && alpha(rgba, BOTTOM_MIDDLE) > 0, 'Sun and Earth below the horizon: veiled')
  const steep = makeTerrain(0, 20)
  assert.ok(!isOptimal(goOverlay(steep, buildCellFrames(steep), SAMPLE, REQ), TOP_MIDDLE), 'too steep: not good')
  const walled = makeTerrain(30, 5)
  assert.ok(!isOptimal(goOverlay(walled, buildCellFrames(walled), SAMPLE, REQ), TOP_MIDDLE), 'a high ridge hides them: not good')
  assert.ok(!isOptimal(goOverlay(t, frames, SAMPLE, { ...REQ, minSunDeg: 60 }), TOP_MIDDLE), 'minimum elevation applies')
})

test('Optimal layer: the Earth hidden alone is enough to lose the cell', () => {
  const t = makeTerrain(0, 5)
  const frames = buildCellFrames(t)
  const earthBehind = { ...SAMPLE, earthLon: 180 } // Sun up, Earth on the far side of the Moon
  assert.ok(!isOptimal(goOverlay(t, frames, earthBehind, REQ), TOP_MIDDLE))
})

test('Optimal layer over a period: the share of samples where the cell is good', () => {
  const t = makeTerrain(0, 5)
  const frames = buildCellFrames(t)
  const away = { ...SAMPLE, sunLon: 180 } // Sun gone from the top of the map
  const f = goFractions(t, frames, [SAMPLE, away], REQ)
  assert.equal(f[TOP_MIDDLE], 0.5)
  assert.equal(f[BOTTOM_MIDDLE], 0) // the Sun comes round, but the Earth never rises there
  assert.equal(goFractions(t, frames, [SAMPLE, SAMPLE], REQ)[TOP_MIDDLE], 1)
  const steep = makeTerrain(0, 20)
  assert.equal(goFractions(steep, buildCellFrames(steep), [SAMPLE], REQ)[TOP_MIDDLE], 0)
  const rgba = goFractionOverlay(t, frames, f)
  assert.ok(isOptimal(rgba, TOP_MIDDLE) && alpha(rgba, TOP_MIDDLE) > 100)
})

test('Optimal has its own color, far from the green of Feasible, and the token of the interface is the same', () => {
  const FEASIBLE_GREEN = [57, 255, 20]
  const distance = Math.hypot(...OPTIMAL_RGB.map((v, k) => v - FEASIBLE_GREEN[k]))
  assert.ok(distance > 200, `Optimal ${OPTIMAL_RGB} is too close to the Feasible green (distance ${distance.toFixed(0)})`)
  const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
  const token = /--color-layer-optimal:\s*rgb\((\d+) (\d+) (\d+)\)/.exec(tokens)
  assert.ok(token, '--color-layer-optimal is in tokens.css')
  assert.deepEqual(token.slice(1).map(Number), OPTIMAL_RGB, 'tokens.css and layerColors.js agree')
})
