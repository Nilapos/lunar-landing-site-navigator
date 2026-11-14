import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LEVEL_CODE, feasibilityKey, feasibilityLevels, feasibilityOverlay, fillLevels, prepareSky } from './feasibility.js'
import { AZIMUTHS, encodeHorizon } from './horizonGrid.js'
import { buildCellFrames } from './illumination.js'
import { DEFAULT_REQUIREMENTS } from './verdict.js'

// A 4 x 4 map whose cells all have the same horizon, the same slope, and are the same, except which cell sees what: with the
// Sun and the Earth over lon 0 on the equator, the cells at the top of the map (lon 0 side) see them, those at the bottom do not.
function makeTerrain({ slopeDeg = 5, horizonDeg = 0 } = {}) {
  const N = 4
  return { grid: N, slope: new Uint8Array(N * N).fill(slopeDeg), horizon: new Uint8Array(N * N * AZIMUTHS).fill(encodeHorizon(horizonDeg)) }
}
const TOP = 1 // row 0, column 1
const BOTTOM = 13 // row 3, column 1
const STILL = { sunLon: 0, sunLat: 0, earthLon: 0, earthLat: 0, earthKm: 384400 }
const SAMPLES = Array.from({ length: 24 }, (_, h) => ({ ...STILL, t: new Date(Date.UTC(2026, 10, 14, h)).toISOString() }))
const REQ = { ...DEFAULT_REQUIREMENTS, batteryHours: 24, linkMinPerHour: 30, bandwidthKbps: 100, antenna: 'mga' }
const levels = (terrain, req = REQ, samples = SAMPLES) => feasibilityLevels(terrain, buildCellFrames(terrain), samples, req)

test('a lit cell in view of the Earth with a gentle slope is feasible, one in the dark is not', () => {
  const l = levels(makeTerrain())
  assert.equal(l[TOP], LEVEL_CODE.ok)
  assert.equal(l[BOTTOM], LEVEL_CODE.fail)
})

test('the slope decides: over the limit fails, just under it is marginal, well under it is feasible', () => {
  assert.equal(levels(makeTerrain({ slopeDeg: 20 }))[TOP], LEVEL_CODE.fail)
  assert.equal(levels(makeTerrain({ slopeDeg: 14 }))[TOP], LEVEL_CODE.warn) // 15 / 14 = 1.07
  assert.equal(levels(makeTerrain({ slopeDeg: 10 }))[TOP], LEVEL_CODE.ok)
})

test('a rover adds its own drive slope limit', () => {
  const t = makeTerrain({ slopeDeg: 10 })
  assert.equal(levels(t, { ...REQ, driveSlopeDeg: 8 })[TOP], LEVEL_CODE.fail)
  assert.equal(levels(t, { ...REQ, driveSlopeDeg: 20 })[TOP], LEVEL_CODE.ok)
})

test('the link needs the Earth often enough, and an antenna that carries the data rate', () => {
  const t = makeTerrain()
  assert.equal(levels(t, { ...REQ, bandwidthKbps: 100000 })[TOP], LEVEL_CODE.fail) // the antenna cannot carry it
  // Earth behind the Moon: never visible, so the link fails.
  const hidden = SAMPLES.map((s) => ({ ...s, earthLon: 180 }))
  assert.equal(levels(t, REQ, hidden)[TOP], LEVEL_CODE.fail)
})

test('the power needs the Sun back before the battery runs out', () => {
  const t = makeTerrain()
  // The Sun goes around: this cell is lit for a part of the 48 hours and dark for the rest.
  const turning = Array.from({ length: 48 }, (_, h) => ({ ...STILL, sunLon: (h * 15) % 360, t: new Date(Date.UTC(2026, 10, 14, h)).toISOString() }))
  const short = levels(t, { ...REQ, batteryHours: 1 }, turning)[TOP]
  const long = levels(t, { ...REQ, batteryHours: 200 }, turning)[TOP]
  assert.equal(short, LEVEL_CODE.fail)
  assert.equal(long, LEVEL_CODE.ok)
})

test('cells outside the map have no verdict, and the overlay paints the three states', () => {
  const t = makeTerrain()
  t.horizon.fill(0, 0, AZIMUTHS) // cell 0 has no horizon data
  const frames = buildCellFrames(t)
  const l = fillLevels(t, frames, prepareSky(SAMPLES), REQ, new Uint8Array(16))
  assert.equal(l[0], 0)
  const rgba = feasibilityOverlay(t, frames, l)
  assert.equal(rgba[3], 0) // no data: transparent
  assert.deepEqual([...rgba.slice(TOP * 4, TOP * 4 + 3)], [57, 255, 20]) // feasible: neon green
  assert.equal(rgba[BOTTOM * 4 + 3], 120) // not feasible: dark veil
  const warn = feasibilityOverlay(t, frames, new Uint8Array(16).fill(LEVEL_CODE.warn))
  assert.deepEqual([...warn.slice(TOP * 4, TOP * 4 + 3)], [255, 183, 77])
})

test('the key changes with the requirements that matter and not with the others', () => {
  const k = feasibilityKey(REQ)
  assert.notEqual(k, feasibilityKey({ ...REQ, maxSlopeDeg: 12 }))
  assert.notEqual(k, feasibilityKey({ ...REQ, driveSlopeDeg: 10 }))
  assert.equal(k, feasibilityKey({ ...REQ, landingMinutes: 99 })) // the landing window is not part of the map
})
