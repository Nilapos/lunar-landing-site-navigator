import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FULL_WINDOW } from './tileGrid.js'
import { formatLat, formatLon, gridLines, latOfRadius, latStepFor, lonStepFor } from './mapGrid.js'
import { polarRadiusKm } from './polarMap.js'

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`)

test('the latitude step follows the zoom: 2 degrees for the whole cap, finer and finer down to 0.005', () => {
  assert.equal(latStepFor(FULL_WINDOW.span), 2)
  assert.equal(latStepFor(152), 1) // 152 / 151.6 = 1.0
  assert.equal(latStepFor(76), 0.5)
  assert.equal(latStepFor(38), 0.2)
  assert.equal(latStepFor(4.75), 0.02)
  assert.equal(latStepFor(0.001), 0.005) // never finer than the smallest step
})

test('latitude of a distance from the pole is the inverse of the projection', () => {
  for (const lat of [-89.9, -88, -85.5, -80]) close(latOfRadius(polarRadiusKm(lat)), lat, 1e-9)
  close(latOfRadius(0), -90, 1e-12)
})

test('the grid of the whole cap: parallels every 2 degrees, a meridian every 30', () => {
  const g = gridLines(FULL_WINDOW)
  assert.deepEqual(g.parallels.map((p) => p.lat), [-88, -86, -84, -82, -80])
  assert.equal(g.latStep, 2)
  assert.equal(g.lonStep, 30)
  const lons = new Set(g.meridians.map((m) => m.lon))
  assert.equal(lons.size, 12)
  for (const lon of [0, 90, 180, 270]) assert.ok(lons.has(lon))
})

test('a zoomed window far from the pole keeps only the lines that can reach it', () => {
  // 20 km wide, at 86.3 S on the 20 E meridian (about 111 km from the pole).
  const rho = polarRadiusKm(-86.3)
  const win = { cx: rho * Math.sin((20 * Math.PI) / 180), cy: rho * Math.cos((20 * Math.PI) / 180), span: 20 }
  const g = gridLines(win)
  assert.equal(g.latStep, 0.1)
  assert.ok(g.parallels.length >= 1 && g.parallels.length <= 12, `${g.parallels.length} parallels`)
  assert.ok(g.parallels.some((p) => Math.abs(p.lat + 86.3) < 1e-9))
  for (const p of g.parallels) assert.ok(Math.abs(p.rho - rho) <= win.span, `parallel at ${p.lat} is ${Math.abs(p.rho - rho)} km away`)
  assert.ok(g.meridians.length >= 2 && g.meridians.length <= 20, `${g.meridians.length} meridians`)
  for (const m of g.meridians) assert.ok(Math.abs(m.lon - 20) < 10, `meridian ${m.lon}`)
  assert.ok(lonStepFor(win) <= 5)
})

test('values of the lines read like a map: 85.5°S, 30°E, 120°W, 0° and 180° without a letter', () => {
  assert.equal(formatLat(-85.5, 0.5), '85.5°S')
  assert.equal(formatLat(-88, 2), '88°S')
  assert.equal(formatLat(-86.35, 0.05), '86.35°S')
  assert.equal(formatLon(30, 15), '30°E')
  assert.equal(formatLon(240, 30), '120°W')
  assert.equal(formatLon(0, 30), '0°')
  assert.equal(formatLon(180, 30), '180°')
  assert.equal(formatLon(20.5, 0.5), '20.5°E')
})
