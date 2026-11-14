import assert from 'node:assert/strict'
import { test } from 'node:test'
import { probeCell } from './cellProbe.js'
import { AZIMUTHS, encodeHorizon } from './horizonGrid.js'
import { buildCellFrames } from './illumination.js'
import {
  angularRadiusDeg,
  capIndices,
  capPositions,
  capRadii,
  causeText,
  EARTH_RADIUS_KM,
  earthPosition,
  edgeTaper,
  groundRings,
  horizonDirection,
  MOON_RADIUS_KM,
  pickCap,
  placeBody,
  polarUv,
  siteBodyStates,
  surfacePoint,
} from './polarSky.js'
import { azEl, localFrame, skyAt } from './sky.js'
import { DEFAULT_REQUIREMENTS } from './verdict.js'

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`)
const length = (v, i = 0) => Math.hypot(v[i], v[i + 1], v[i + 2])

// A small map: every cell has the same height, slope and horizon.
function makeTerrain({ grid = 8, heightM = 0, slopeDeg = 5, horizonDeg = 0 } = {}) {
  return {
    grid,
    heights: new Int16Array(grid * grid).fill(heightM),
    slope: new Uint8Array(grid * grid).fill(slopeDeg),
    horizon: new Uint8Array(grid * grid * AZIMUTHS).fill(encodeHorizon(horizonDeg)),
  }
}

test('the cap lies on the sphere, in the southern hemisphere, with lon 0 toward +x', () => {
  const t = makeTerrain()
  const p = capPositions(t, 1)
  for (let c = 0; c < t.grid ** 2; c++) {
    close(length(p, c * 3), MOON_RADIUS_KM, 0.01)
    assert.ok(p[c * 3 + 2] < -MOON_RADIUS_KM * 0.95, 'near the south pole')
  }
  const topMiddle = 3 // row 0 = the lon 0 side of the map
  const bottomMiddle = 7 * 8 + 3
  assert.ok(p[topMiddle * 3] > 0 && p[bottomMiddle * 3] < 0)
  const rightMiddle = 3 * 8 + 7 // the right of the map is lon 90 E = +y
  assert.ok(p[rightMiddle * 3 + 1] > 0)
})

test('relief is multiplied by the exaggeration inside the map and fades out at its edge', () => {
  const t = makeTerrain({ grid: 64, heightM: 2000 })
  const center = 32 * 64 + 32
  close(length(capPositions(t, 1), center * 3), MOON_RADIUS_KM + 2, 0.01)
  close(length(capPositions(t, 4), center * 3), MOON_RADIUS_KM + 8, 0.01)
  const edgeCell = 32 * 64 // left edge, on the 80 S circle
  close(length(capPositions(t, 4), edgeCell * 3), MOON_RADIUS_KM, 0.05)
  assert.equal(edgeTaper(0.5), 1)
  assert.equal(edgeTaper(1), 0)
  close(length(surfacePoint(t, -89.9, 0, 4, 1)), MOON_RADIUS_KM + 9, 0.01)
})

test('cap triangles stay inside the 80 S circle', () => {
  const idx = capIndices(8)
  assert.ok(idx.length > 0 && idx.length % 3 === 0)
  assert.ok(!idx.includes(0), 'the corner cell is outside the circle')
  assert.ok(idx.includes(3 * 8 + 3))
})

test('a body is drawn in its true direction with its true angular size', () => {
  const sample = { earthLat: 0, earthLon: 0, earthKm: 384400 }
  const camera = [0, 0, -(MOON_RADIUS_KM + 500)]
  const placed = placeBody(camera, { position: earthPosition(sample), radiusKm: EARTH_RADIUS_KM }, 30000)
  // About 1.9 degrees wide, and the drawn sphere has the same angular radius as the real one.
  close(placed.angularRadiusDeg * 2, 1.9, 0.02)
  close(angularRadiusDeg(placed.radius, 30000), placed.angularRadiusDeg, 1e-9)
  // The camera is below the equator plane, so the Earth appears slightly "north" of the +x direction (parallax).
  assert.ok(placed.direction[0] > 0.99 && placed.direction[2] > 0)
  close(Math.atan2(placed.direction[2], placed.direction[0]) * (180 / Math.PI), 0.333, 0.01)
  const sun = placeBody(camera, { direction: [0, 1, 0], angularRadiusDeg: 0.265 }, 1000)
  assert.deepEqual(sun.position, [0, 1000, camera[2]])
  close(sun.radius, 4.625, 0.001)
})

test('site states use the same margin as the analysis, and the cause is said in words', () => {
  const site = { lat: -89.5, lon: 0 }
  const sample = { sunLat: -1.5, sunLon: 180, earthLat: -5, earthLon: 0, earthKm: 384400 }
  const sky = skyAt(site.lat, site.lon, sample)
  const profile = new Array(360).fill(3.2)
  const s = siteBodyStates(site, sample, profile, { minSunDeg: 0, minEarthDeg: 0 })
  close(s.sun.margin, sky.sunEl - 3.2, 1e-9)
  assert.equal(s.sun.visible, false)
  assert.equal(s.earth.visible, true)
  assert.match(causeText('Sun', s.sun), /^Sun \+\d\.\d° is under the \+3\.2° ridge \(hidden\)$/)
  assert.match(causeText('Earth', s.earth), /is above the \+3\.2° ridge \(visible\)$/)
  const low = causeText('Earth', { el: -0.1, horizon: -1.4, min: 5, margin: -3.7, visible: false })
  assert.equal(low, 'Earth −0.1° is less than 5° above the −1.4° horizon (too low)')
})

// One day of hourly samples: the Sun goes around the horizon, the Earth stays above lon 0.
const SAMPLES = Array.from({ length: 25 }, (_, h) => ({
  t: new Date(Date.UTC(2026, 10, 14, h)).toISOString(),
  sunLat: -1.5,
  sunLon: h * 15,
  earthLat: -5,
  earthLon: 0,
  earthKm: 384400,
}))
const REQ = { ...DEFAULT_REQUIREMENTS, batteryHours: 10 }

test('a flat cell near the pole with the Sun and the Earth up is a good zone', () => {
  const t = makeTerrain({ grid: 64, horizonDeg: -1 })
  const frames = buildCellFrames(t)
  const probe = probeCell(t, frames, 32 * 64 + 32, SAMPLES, 0, REQ)
  assert.equal(probe.level, 'ok')
  assert.equal(probe.fractions.sun, 1)
  assert.equal(probe.fractions.both, 1)
  assert.ok(probe.now.earth.margin > 0 && probe.now.sun.margin > 0)
  assert.equal(probe.score, 99) // terrain 100, power 100, comms 97 (the antenna gives 1.95 times the data rate needed)
})

test('too steep, or hidden from the Earth by a rim: red, with the reason', () => {
  const steep = makeTerrain({ grid: 64, horizonDeg: -1, slopeDeg: 21 })
  const a = probeCell(steep, buildCellFrames(steep), 32 * 64 + 32, SAMPLES, 0, REQ)
  assert.equal(a.level, 'fail')
  assert.equal(a.reason, 'too steep: 21° for a 15° limit')

  const walled = makeTerrain({ grid: 64, horizonDeg: 12 })
  const b = probeCell(walled, buildCellFrames(walled), 32 * 64 + 32, SAMPLES, 3, REQ)
  assert.equal(b.level, 'fail')
  assert.equal(b.fractions.earth, 0)
  assert.ok(b.now.sun.margin < 0)
  assert.equal(b.score, 33) // terrain 100, power 0, comms 0
})

test('no card outside the map', () => {
  const t = makeTerrain({ grid: 64 })
  t.horizon.fill(0, 0, AZIMUTHS) // the corner cell has no horizon data
  assert.equal(probeCell(t, buildCellFrames(t), 0, SAMPLES, 0, REQ), null)
})

test('a direction built from azimuth and elevation reads back the same, and ground rings end at the horizon', () => {
  const frame = localFrame(-88.8, 123)
  const back = azEl(frame, horizonDirection(frame, 247.5, 3.2))
  close(back.az, 247.5, 1e-9)
  close(back.el, 3.2, 1e-9)
  for (const horizon of [-5.5, 0, 12]) {
    const rings = groundRings(horizon)
    assert.equal(rings.at(-1), horizon)
    assert.ok(rings.every((el, i) => i === 0 || el > rings[i - 1]), 'rings go up')
  }
})

test('the Moon picture is centered on the south pole: pole in the middle, north pole on the edge, no seam in longitude', () => {
  const [u0, v0] = polarUv(0, 0, -1)
  close(u0, 0.5, 1e-9)
  close(v0, 0.5, 1e-9)
  const [un, vn] = polarUv(0, 0, 1)
  close(Math.hypot(un - 0.5, vn - 0.5), 0.5, 1e-9)
  // Points on a small circle around the south pole stay on a circle in the picture.
  for (const lon of [0, 90, 200, 359]) {
    const lat = (-80 * Math.PI) / 180
    const [u, v] = polarUv(Math.cos(lat) * Math.cos((lon * Math.PI) / 180), Math.cos(lat) * Math.sin((lon * Math.PI) / 180), Math.sin(lat))
    close(Math.hypot(u - 0.5, v - 0.5), 0.5 * (10 / 180), 1e-9)
  }
})

test('a ray from above hits the cap where it should, a ray that misses it hits nothing', () => {
  const terrain = makeTerrain({ grid: 64, heightM: 0 })
  const bounds = capRadii(capPositions(terrain, 1), 64)
  // Straight down on the pole.
  const down = pickCap(bounds, [0, 0, -(MOON_RADIUS_KM + 100)], [0, 0, 1])
  assert.ok(down)
  close(length(down.point), MOON_RADIUS_KM, 0.05)
  assert.ok(Math.hypot(down.point[0], down.point[1]) < 1)
  // Down on a point 100 km from the pole toward lon 90 E (+y), from 50 km up: the cell is the one under it.
  const target = surfacePoint(terrain, -90 + 100 / 30.32, 90, 1)
  const up = target.map((v) => v / length(target))
  const from = target.map((v, i) => v + up[i] * 50)
  const hit = pickCap(bounds, from, up.map((v) => -v))
  assert.ok(hit)
  close(hit.point[0], target[0], 0.1)
  close(hit.point[1], target[1], 0.1)
  close(hit.point[2], target[2], 0.1)
  // A ray over the far side of the Moon, or passing high above the pole: no hit.
  assert.equal(pickCap(bounds, [0, 0, MOON_RADIUS_KM + 100], [0, 0, -1]), null)
  assert.equal(pickCap(bounds, [0, 3000, -2000], [0, -1, 0]), null)
});

test('the picked cell follows the relief: a bump is hit on its summit, not behind it', () => {
  const terrain = makeTerrain({ grid: 64, heightM: 0 })
  // A 4 km high bump around cell (40, 32).
  for (let gy = 30; gy <= 34; gy++) for (let gx = 38; gx <= 42; gx++) terrain.heights[gy * 64 + gx] = 4000
  const positions = capPositions(terrain, 1)
  const bounds = capRadii(positions, 64)
  const top = positions.slice((32 * 64 + 40) * 3, (32 * 64 + 40) * 3 + 3)
  const u = Array.from(top).map((v) => v / length(top))
  const from = Array.from(top).map((v, i) => v + u[i] * 30)
  const hit = pickCap(bounds, from, u.map((v) => -v))
  assert.ok(hit)
  assert.equal(hit.index, 32 * 64 + 40)
  close(length(hit.point), length(top), 0.2)
});
