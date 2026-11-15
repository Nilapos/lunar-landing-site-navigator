import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_MISSION_ID, STATUSES, isAntennaClass, landerById, landers, missions, roverById, rovers, roversFor } from '../data/vehicles.js'
import { requirementsFor } from './missionRequirements.js'
import { analyzeScenario } from './scenario.js'
import { slopePercentile } from './scores.js'
import { DEFAULT_REQUIREMENTS, evaluateScenario } from './verdict.js'

const isHttps = (u) => typeof u === 'string' && u.startsWith('https://')
const positive = (v) => Number.isFinite(v) && v > 0
const atLeastZero = (v) => Number.isFinite(v) && v >= 0

test('catalog: ids are unique, every entry has a valid status, and sourced entries have https sources', () => {
  const ids = [...landers, ...rovers].map((v) => v.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const v of [...landers, ...rovers]) {
    assert.ok(STATUSES.includes(v.status), `${v.id} status`)
    assert.ok(v.name && v.note, `${v.id} has a name and a note`)
    if (v.status === 'sourced') assert.ok(v.sources.length > 0 && v.sources.every((s) => s.label && isHttps(s.url)), `${v.id} sources`)
  }
})

test('catalog: the numbers are plausible and the antenna class exists', () => {
  for (const l of landers) {
    assert.ok(positive(l.landing.maxSlopeDeg) && l.landing.maxSlopeDeg <= 45, `${l.id} landing slope`)
    assert.ok(positive(l.landing.sequenceMinutes), `${l.id} sequence`)
    assert.ok(positive(l.power.survivalHours) && atLeastZero(l.power.minSunDeg), `${l.id} power`)
    assert.ok(isAntennaClass(l.comms.antenna), `${l.id} antenna`)
    assert.ok(positive(l.comms.dataRateNeededKbps) && atLeastZero(l.comms.linkMinPerHour) && l.comms.linkMinPerHour <= 60 && atLeastZero(l.comms.minEarthDeg), `${l.id} comms`)
    assert.ok(atLeastZero(l.payloadCapacityKg), `${l.id} payload`)
  }
  for (const r of rovers) {
    assert.ok(positive(r.mobility.maxDriveSlopeDeg) && r.mobility.maxDriveSlopeDeg <= 45, `${r.id} drive slope`)
    assert.ok(positive(r.power.survivalHours) && atLeastZero(r.power.minSunDeg), `${r.id} power`)
  }
})

test('catalog: a rover is carried by existing landers only, and missions pair compatible vehicles', () => {
  for (const r of rovers) {
    assert.ok(r.carriedBy.length > 0, `${r.id} has a lander to go with`)
    for (const id of r.carriedBy) assert.ok(landerById(id), `${r.id} carried by ${id}`)
  }
  assert.ok(missions.some((m) => m.id === DEFAULT_MISSION_ID))
  for (const m of missions) {
    assert.ok(landerById(m.landerId), `${m.id} lander`)
    if (m.roverId) {
      assert.ok(roverById(m.roverId), `${m.id} rover`)
      assert.ok(roversFor(m.landerId).some((r) => r.id === m.roverId), `${m.id}: the lander can carry that rover`)
    }
  }
  assert.deepEqual(roversFor('generic-lander'), []) // a lander that carries nothing offers no rover
})

test('the generic mission reproduces the default requirements exactly, so nothing changes until the catalog is filled', () => {
  const generic = missions.find((m) => m.id === DEFAULT_MISSION_ID)
  const { requirements, status } = requirementsFor(landerById(generic.landerId), null)
  assert.deepEqual(requirements, DEFAULT_REQUIREMENTS)
  assert.equal(status, 'hypothesis')
})

test('a rover adds its drive slope and the weakest link sets the survival', () => {
  const lander = landerById('generic-heavy-lander')
  const rover = roverById('generic-small-rover')
  const { requirements, origin } = requirementsFor(lander, rover)
  assert.equal(requirements.driveSlopeDeg, rover.mobility.maxDriveSlopeDeg)
  assert.equal(origin.driveSlopeDeg, 'rover')
  assert.equal(requirements.batteryHours, Math.min(lander.power.survivalHours, rover.power.survivalHours))
  assert.equal(origin.batteryHours, 'rover') // the rover endures less than the lander here
  assert.equal(requirements.minSunDeg, Math.max(lander.power.minSunDeg, rover.power.minSunDeg))
  assert.equal(requirements.maxSlopeDeg, lander.landing.maxSlopeDeg) // landing: the lander
  assert.equal(requirements.landingMinutes, lander.landing.sequenceMinutes)
  assert.equal(requirements.antenna, lander.comms.antenna)
})

test('equal numbers are credited to both, and a sourced mission needs sourced vehicles', () => {
  const lander = { ...landers[0], status: 'sourced', power: { survivalHours: 100, minSunDeg: 2 } }
  const rover = { ...rovers[0], status: 'sourced', power: { survivalHours: 100, minSunDeg: 2 } }
  const both = requirementsFor(lander, rover)
  assert.equal(both.origin.batteryHours, 'both')
  assert.equal(both.origin.minSunDeg, 'both')
  assert.equal(both.status, 'sourced')
  assert.equal(requirementsFor(lander, { ...rover, status: 'hypothesis' }).status, 'hypothesis')
})

test('slope percentile reads a 1-degree histogram', () => {
  const histogram = new Array(46).fill(0)
  histogram[2] = 50 // 50 cells between 2 and 3 degrees
  histogram[12] = 40
  histogram[30] = 10
  assert.equal(slopePercentile(histogram, 0.5), 3)
  assert.equal(slopePercentile(histogram, 0.9), 13)
  assert.equal(slopePercentile(histogram, 1), 31)
  assert.equal(slopePercentile(new Array(46).fill(0), 0.9), 0)
})

// A flat series where the Sun and the Earth are always up, on a site whose slope within 100 m is gentle.
const HOUR = 3600000
const T0 = Date.UTC(2026, 10, 14)
const SERIES = Array.from({ length: 48 }, (_, h) => ({ t: new Date(T0 + h * HOUR).toISOString(), sunEl: 5, sunAz: 0, earthEl: 5, earthAz: 0 }))
const histogram = (bins) => {
  const out = new Array(46).fill(0)
  for (const [bin, n] of Object.entries(bins)) out[bin] = n
  return out
}
const terrainItem = (req, terrain) => evaluateScenario(analyzeScenario(SERIES, null), req, T0, terrain).items.find((i) => i.key === 'terrain')

test('the terrain verdict looks at the ground the rover must drive only when there is a rover', () => {
  // Landing spot gentle (4 deg); the surroundings are rough: 90% of the ground is under 24 degrees.
  const terrain = { slopeMaxDeg: 4, histogram500: histogram({ 10: 20, 22: 70, 30: 10 }) }
  const noRover = terrainItem({ ...DEFAULT_REQUIREMENTS, maxSlopeDeg: 15, driveSlopeDeg: null }, terrain)
  const withRover = terrainItem({ ...DEFAULT_REQUIREMENTS, maxSlopeDeg: 15, driveSlopeDeg: 15 }, terrain)
  assert.equal(noRover.level, 'ok')
  assert.equal(withRover.level, 'fail') // landing is fine, but the rover cannot drive around
  assert.ok(withRover.ratio < noRover.ratio)
  assert.match(withRover.detail, /Rover: 90% of the ground within 500 m is under 23° vs drive limit 15°/)
  // A rover that drives steeper slopes passes.
  assert.equal(terrainItem({ ...DEFAULT_REQUIREMENTS, driveSlopeDeg: 35 }, terrain).level, 'ok')
})

test('energy specs: none for the generic mission, each vehicle its own for a lander with a rover', () => {
  const generic = requirementsFor(landerById('generic-lander'), null).requirements
  assert.equal(generic.energy, null)
  const pair = requirementsFor(landerById('generic-heavy-lander'), roverById('generic-small-rover')).requirements
  assert.equal(pair.energy.lander, landerById('generic-heavy-lander').power.energy)
  assert.equal(pair.energy.rover, roverById('generic-small-rover').power.energy)
  assert.ok(pair.energy.lander.panelAreaM2 > 0 && pair.energy.rover.panelAreaM2 > 0)
})
