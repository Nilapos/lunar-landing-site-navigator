import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cellSeries } from './cellProbe.js'
import { LEVEL_CODE, cellRatios, feasibilityKey, feasibilityLevels, feasibilityOverlay, momentIndex, prepareFeasibility, prepareSky } from './feasibility.js'
import { AZIMUTHS, encodeHorizon } from './horizonGrid.js'
import { buildCellFrames } from './illumination.js'
import { evaluateFromMoment } from './momentScores.js'
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
const at = (h) => new Date(Date.UTC(2026, 10, 14, h)).toISOString()
const SAMPLES = Array.from({ length: 24 }, (_, h) => ({ ...STILL, t: at(h) }))
const REQ = { ...DEFAULT_REQUIREMENTS, batteryHours: 24, linkMinPerHour: 30, bandwidthKbps: 100, antenna: 'mga' }
const levels = (terrain, req = REQ, samples = SAMPLES, index = 0) => feasibilityLevels(terrain, buildCellFrames(terrain), samples, req, index)

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
  const turning = Array.from({ length: 48 }, (_, h) => ({ ...STILL, sunLon: (h * 15) % 360, t: at(h) }))
  const short = levels(t, { ...REQ, batteryHours: 1 }, turning)[TOP]
  const long = levels(t, { ...REQ, batteryHours: 200 }, turning)[TOP]
  assert.equal(short, LEVEL_CODE.fail)
  assert.equal(long, LEVEL_CODE.ok)
})

// 100 hours: the Sun is down for the first 50 (sunLon 180), then up for 50 (sunLon 0); the Earth stays in view.
const NIGHT_THEN_DAY = Array.from({ length: 100 }, (_, h) => ({ ...STILL, sunLon: h < 50 ? 180 : 0, t: at(h) }))
// The reverse: up for 50 hours, then down for 50.
const DAY_THEN_NIGHT = Array.from({ length: 100 }, (_, h) => ({ ...STILL, sunLon: h < 50 ? 0 : 180, t: at(h) }))

test('the verdict follows the landing moment: the same cell is not feasible now and feasible later', () => {
  const t = makeTerrain()
  const req = { ...REQ, batteryHours: 24 }
  assert.equal(levels(t, req, NIGHT_THEN_DAY, 0)[TOP], LEVEL_CODE.fail, 'dark at the landing: the landing window is missing')
  assert.equal(levels(t, req, NIGHT_THEN_DAY, 55)[TOP], LEVEL_CODE.ok, 'lit, and no night left to the end of the range')
  assert.equal(levels(t, req, DAY_THEN_NIGHT, 10)[TOP], LEVEL_CODE.fail, 'lit now, but a night of 50 h is ahead and the battery holds 24 h')
  assert.equal(levels(t, { ...req, batteryHours: 200 }, DAY_THEN_NIGHT, 10)[TOP], LEVEL_CODE.ok, 'a battery that holds that night')
})

test('the mission length: a night after the mission does not count', () => {
  const t = makeTerrain()
  const req = { ...REQ, batteryHours: 24 }
  assert.equal(levels(t, { ...req, missionDays: Infinity }, DAY_THEN_NIGHT, 10)[TOP], LEVEL_CODE.fail, 'the night of 50 h starts at hour 50')
  assert.equal(levels(t, { ...req, missionDays: 1 }, DAY_THEN_NIGHT, 10)[TOP], LEVEL_CODE.ok, 'a mission of 24 h ends at hour 34, before the night')
  assert.equal(levels(t, { ...req, batteryHours: 6, missionDays: 2 }, DAY_THEN_NIGHT, 10)[TOP], LEVEL_CODE.fail, 'a mission of 48 h ends at hour 58: 8 h of night count, the battery holds 6 h')
  assert.equal(levels(t, { ...req, batteryHours: 24, missionDays: 2 }, DAY_THEN_NIGHT, 10)[TOP], LEVEL_CODE.ok, 'the same 8 h of night, a battery of 24 h')
})

test('the Sun and the Earth must be together long enough at the landing', () => {
  const t = makeTerrain()
  const frames = buildCellFrames(t)
  // Both up for 5 hours at the start, then the Earth leaves.
  const samples = Array.from({ length: 40 }, (_, h) => ({ ...STILL, earthLon: h < 5 ? 0 : 180, t: at(h) }))
  const prep = prepareFeasibility(t, frames, samples, REQ, 240)
  const r = cellRatios(t, prep, { ...REQ, landingMinutes: 60 }, TOP, 0)
  assert.ok(Math.abs(r.window - 5) < 1e-9, 'five hours together over the hour needed')
  assert.equal(cellRatios(t, prep, { ...REQ, landingMinutes: 60 }, TOP, 10).window, 0, 'not together at hour 10')
})

test('landing on the last moment of the range leaves nothing to judge: not feasible', () => {
  assert.equal(levels(makeTerrain(), REQ, SAMPLES, SAMPLES.length - 1)[TOP], LEVEL_CODE.fail)
})

test('the ratios are those of the verdict of a site landed at the same moment (power, link and window items)', () => {
  const t = makeTerrain({ horizonDeg: 0 })
  const frames = buildCellFrames(t)
  // Crisp series of 160 hours: the Sun is up 40 h, down 30 h, up 50 h, down 40 h; the Earth is in view except for hours 90 to 120.
  const sunUp = (h) => h < 40 || (h >= 70 && h < 120)
  const samples = Array.from({ length: 160 }, (_, h) => ({ ...STILL, sunLon: sunUp(h) ? 0 : 180, earthLon: h >= 90 && h < 120 ? 180 : 0, t: at(h) }))
  const req = { ...REQ, batteryHours: 36, linkMinPerHour: 30, landingMinutes: 600 }
  const prep = prepareFeasibility(t, frames, samples, req, 240)
  const result = { data: { series: cellSeries(frames, TOP, samples) }, profile: new Array(360).fill(0), terrain: { slopeMeanDeg: 5, slopeMaxDeg: 5, histogram500: Array.from({ length: 30 }, (_, i) => (i === 5 ? 10 : 0)) } }
  const close = (a, b, what) => {
    if (a === Infinity || b === Infinity) return assert.equal(a, b, what)
    assert.ok(Math.abs(a - b) <= 0.04 * Math.max(a, b, 1e-9) + 1e-9, `${what}: ${a} vs ${b}`)
  }
  for (const missionDays of [Infinity, 4]) {
    const reqM = { ...req, missionDays }
    for (const h of [0, 5, 20, 45, 72, 100]) {
      const ev = evaluateFromMoment(result, reqM, Date.parse(at(h)))
      const item = (key) => ev.items.find((i) => i.key === key).ratio
      const r = cellRatios(t, prep, reqM, TOP, h)
      close(r.power, item('power'), `power at hour ${h}, mission ${missionDays} d`)
      close(r.link, item('comms'), `link at hour ${h}, mission ${missionDays} d`)
      close(r.window, item('window'), `window at hour ${h}, mission ${missionDays} d`)
    }
  }
})

test('the sky is sampled at most maxSamples times and a timeline sample maps to the first prepared one after it', () => {
  const samples = Array.from({ length: 4160 }, (_, k) => ({ ...STILL, t: new Date(Date.UTC(2026, 10, 14) + k * 2 * 3600000).toISOString() }))
  const sky = prepareSky(samples, 720)
  assert.ok(sky.picked.length <= 720)
  assert.equal(sky.stride, 6)
  assert.equal(momentIndex(sky, 0), 0)
  assert.equal(momentIndex(sky, 6), 1)
  assert.equal(momentIndex(sky, 7), 2) // landing a little later, never earlier than the moment shown
  assert.equal(momentIndex(sky, 4159), sky.picked.length - 1)
})

test('cells outside the map have no verdict, and the overlay paints the three states', () => {
  const t = makeTerrain()
  t.horizon.fill(0, 0, AZIMUTHS) // cell 0 has no horizon data
  const frames = buildCellFrames(t)
  const l = feasibilityLevels(t, frames, SAMPLES, REQ)
  assert.equal(l[0], 0)
  const rgba = feasibilityOverlay(t, frames, l)
  assert.equal(rgba[3], 0) // no data: transparent
  assert.deepEqual([...rgba.slice(TOP * 4, TOP * 4 + 3)], [57, 255, 20]) // feasible: neon green
  assert.equal(rgba[BOTTOM * 4 + 3], 120) // not feasible: dark veil
  const warn = feasibilityOverlay(t, frames, new Uint8Array(16).fill(LEVEL_CODE.warn))
  assert.deepEqual([...warn.slice(TOP * 4, TOP * 4 + 3)], [255, 183, 77])
  // The "+ Marginal" pill off: the marginal cells go under the veil, the feasible ones stay.
  const strict = feasibilityOverlay(t, frames, new Uint8Array(16).fill(LEVEL_CODE.warn), { marginal: false })
  assert.equal(strict[TOP * 4 + 3], 120)
  assert.deepEqual([...strict.slice(TOP * 4, TOP * 4 + 3)], [0, 0, 0])
  assert.deepEqual([...feasibilityOverlay(t, frames, l, { marginal: false }).slice(TOP * 4, TOP * 4 + 3)], [57, 255, 20])
})

test('the key changes with the requirements that matter', () => {
  const k = feasibilityKey(REQ)
  assert.notEqual(k, feasibilityKey({ ...REQ, maxSlopeDeg: 12 }))
  assert.notEqual(k, feasibilityKey({ ...REQ, driveSlopeDeg: 10 }))
  assert.notEqual(k, feasibilityKey({ ...REQ, landingMinutes: 99 })) // the landing window is part of the verdict now
  assert.notEqual(k, feasibilityKey({ ...REQ, missionDays: 7 }))
  assert.equal(k, feasibilityKey({ ...REQ, energy: { lander: null } })) // the energy balance is not
})
