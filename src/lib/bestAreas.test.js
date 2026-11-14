import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findBestAreas, nearestSite } from './bestAreas.js'
import { AZIMUTHS, encodeHorizon } from './horizonGrid.js'
import { buildCellFrames } from './illumination.js'
import { DEFAULT_REQUIREMENTS } from './verdict.js'

// A 32 x 32 map (19 km cells). Every cell has a flat horizon, a gentle slope except a steep band, so some cells are never good.
function makeTerrain({ steepRows = [] } = {}) {
  const N = 32
  const slope = new Uint8Array(N * N).fill(4)
  for (const r of steepRows) for (let x = 0; x < N; x++) slope[r * N + x] = 30
  return { grid: N, slope, horizon: new Uint8Array(N * N * AZIMUTHS).fill(encodeHorizon(-1)) }
}

// Two days of hourly samples: the Earth stays over lon 0, the Sun goes around the equator, so the cells on the lon 0 side
// of the map are good for part of the day.
const SAMPLES = Array.from({ length: 49 }, (_, h) => ({
  t: new Date(Date.UTC(2026, 10, 14, h)).toISOString(),
  sunLat: -1.5,
  sunLon: (h * 15) % 360,
  earthLat: -5,
  earthLon: 0,
  earthKm: 384400,
}))
const REQ = { ...DEFAULT_REQUIREMENTS, batteryHours: 24 }

test('finds distinct areas, best first, kept apart', () => {
  const t = makeTerrain()
  const areas = findBestAreas(t, buildCellFrames(t), SAMPLES, REQ, { count: 4, minSeparationKm: 60 })
  assert.ok(areas.length > 1 && areas.length <= 4)
  for (let i = 1; i < areas.length; i++) assert.ok(areas[i - 1].score >= areas[i].score, 'sorted by score')
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) assert.ok(Math.hypot(areas[i].xKm - areas[j].xKm, areas[i].yKm - areas[j].yKm) >= 60)
  }
  const a = areas[0]
  assert.ok(a.lat < -83 && a.lat > -90 && a.lon >= 0 && a.lon < 360, 'only south of 83 S')
  assert.ok(a.goFraction > 0 && a.goFraction <= 1)
  assert.ok(typeof a.reason === 'string' && a.reason.length > 0)
})

test('steep cells are never proposed', () => {
  const t = makeTerrain({ steepRows: Array.from({ length: 32 }, (_, r) => r) }) // every cell too steep
  assert.deepEqual(findBestAreas(t, buildCellFrames(t), SAMPLES, REQ), [])
  const half = makeTerrain({ steepRows: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })
  const frames = buildCellFrames(half)
  for (const area of findBestAreas(half, frames, SAMPLES, REQ, { count: 6, minSeparationKm: 20 })) {
    assert.ok(half.slope[area.cell] < REQ.maxSlopeDeg)
  }
})

test('a stricter slope limit can only shrink or keep the best list', () => {
  const t = makeTerrain()
  const frames = buildCellFrames(t)
  const loose = findBestAreas(t, frames, SAMPLES, { ...REQ, maxSlopeDeg: 15 })
  const tight = findBestAreas(t, frames, SAMPLES, { ...REQ, maxSlopeDeg: 3 }) // slope 4 is now too steep everywhere
  assert.ok(loose.length > 0)
  assert.equal(tight.length, 0)
})

test('the nearest known site is named only when it is close enough', () => {
  const rho = 150
  const area = { xKm: rho, yKm: 0 } // 150 km from the pole toward lon 90
  const near = { lat: -90 + (2 * Math.atan(150 / (2 * 1737.4)) * 180) / Math.PI, lon: 90, shortName: 'Near' }
  const far = { lat: -85, lon: 270, shortName: 'Far' }
  const found = nearestSite(area, [far, near], 40)
  assert.equal(found.site.shortName, 'Near')
  assert.ok(found.distanceKm < 1)
  assert.equal(nearestSite(area, [far], 40), null)
})
