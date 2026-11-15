import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AZIMUTHS, encodeHorizon } from './horizonGrid.js'
import { buildCellFrames } from './illumination.js'
import { makeRegolithData } from './siteGround.js'
import { buildSiteRelief, EYE_M, heightAt, reliefRadii, reliefSources, reliefSunMargins, RELIEF_AZIMUTHS } from './siteRelief.js'
import { unitVector } from './sky.js'

// A 64 x 64 overview: every cell at `heightM`, with the same terrain horizon in every direction.
function makeTerrain({ grid = 64, heightM = 0, horizonDeg = 0 } = {}) {
  return {
    grid,
    heights: new Int16Array(grid * grid).fill(heightM),
    slope: new Uint8Array(grid * grid),
    horizon: new Uint8Array(grid * grid * AZIMUTHS).fill(encodeHorizon(horizonDeg)),
  }
}
const SITE = { lat: -88, lon: 40 }
const elevationDeg = (local, v) => (Math.atan2(local[v * 3 + 2], Math.hypot(local[v * 3], local[v * 3 + 1])) * 180) / Math.PI
function build(profile, terrain = makeTerrain()) {
  const sources = reliefSources({ terrain, frames: buildCellFrames(terrain) })
  return { sources, relief: buildSiteRelief({ ...SITE, profile, sources }) }
}

test('rings grow from under a meter to 220 km', () => {
  const radii = reliefRadii()
  assert.ok(radii[0] < 1 && radii.at(-1) === 220000)
  assert.ok(radii.every((r, i) => i === 0 || r > radii[i - 1]))
})

test('the ground is 2 m under the eyes and the mesh is far to near', () => {
  const { relief } = build(new Array(360).fill(0))
  const center = relief.count - 1
  assert.ok(Math.abs(relief.local[center * 3 + 2] + EYE_M) < 1e-3)
  assert.equal(relief.count, RELIEF_AZIMUTHS * relief.rings + 1)
  assert.equal(relief.indices.length % 3, 0)
  // The first triangle is on the outermost rings, the last one touches the vertex under the feet.
  assert.ok(relief.indices[0] >= (relief.rings - 2) * RELIEF_AZIMUTHS)
  assert.equal(relief.indices[relief.indices.length - 3], center)
  // On flat ground the normals point up.
  assert.ok(relief.normals[center * 3 + 2] > 0.99)
})

test('the skyline of the mesh is the horizon profile of the site, in every direction', () => {
  const profile = Array.from({ length: 360 }, (_, az) => 2 + 3 * Math.sin((az * Math.PI) / 180)) // from -1 to 5 degrees
  const { relief } = build(profile)
  for (let az = 0; az < 360; az++) {
    let top = -90
    for (let k = 0; k < relief.rings; k++) top = Math.max(top, elevationDeg(relief.local, k * RELIEF_AZIMUTHS + az))
    assert.ok(Math.abs(top - profile[az]) < 1e-3, `azimuth ${az}: ${top} vs ${profile[az]}`)
  }
  // The ground at the feet is not moved by the correction: the first rings are still a flat floor 2 m under the eyes.
  assert.ok(Math.abs(relief.local[2] + EYE_M) < 0.01)
})

test('a finer grid counts inside its area and fades into the overview at its edge', () => {
  const terrain = makeTerrain()
  const frames = buildCellFrames(terrain)
  // A 16 km zone of 64 cells, 500 m above the overview, around the map point (30, -20) km.
  const zone = { cells: 64, centerXKm: 30, centerYKm: -20, sizeKm: 16, heights: new Int16Array(64 * 64).fill(500), horizon: new Uint8Array(64 * 64 * AZIMUTHS).fill(encodeHorizon(0)) }
  const zoneFrames = { valid: new Uint8Array(64 * 64).fill(1), up: new Float32Array(64 * 64 * 3), east: new Float32Array(64 * 64 * 3), north: new Float32Array(64 * 64 * 3) }
  const sources = reliefSources({ terrain, frames, zone, zoneFrames })
  assert.equal(sources.length, 2)
  assert.equal(heightAt(sources, 30, -20), 500) // inside
  assert.equal(heightAt(sources, 60, -20), 0) // outside: the overview
  const edge = heightAt(sources, 30 + 8 - 0.4, -20) // in the last cells: between the two
  assert.ok(edge > 0 && edge < 500, `edge ${edge}`)
})

test('sunlight: the margin of the site near the observer, the one of the grid cells far away', () => {
  const horizonDeg = 2
  const { sources, relief } = build(new Array(360).fill(0), makeTerrain({ horizonDeg }))
  const sun = unitVector(-1.5, 40) // above the site's meridian, 1.5 degrees south of the equator
  const margins = reliefSunMargins(relief, sources, sun, 7)
  assert.equal(margins[relief.count - 1], 7) // under the feet: the site's own margin
  assert.equal(margins[0], 7) // first ring too
  // Far away (the ring near 10 km, toward the Sun): the Sun's height there minus the 2 degree horizon of the cells.
  const ring = relief.radiiM.findIndex((r) => r > 10000)
  const far = margins[ring * RELIEF_AZIMUTHS]
  assert.ok(far < 2 && far > -5, `far margin ${far}`)
  assert.ok(Math.abs(far - 7) > 1)
  // A lower Sun lowers every far margin by the same angle.
  const lower = reliefSunMargins(relief, sources, unitVector(-0.5, 40), 7)
  assert.ok(Math.abs(far - lower[ring * RELIEF_AZIMUTHS] - 1) < 0.05)
})

test('sunlight for a sector only: the directions the camera sees are worked out, the others are left alone', () => {
  const { sources, relief } = build(new Array(360).fill(0), makeTerrain({ horizonDeg: 2 }))
  const sun = unitVector(-1.5, 40)
  const all = reliefSunMargins(relief, sources, sun, 7)
  const out = new Float32Array(relief.count).fill(-99)
  reliefSunMargins(relief, sources, sun, 7, out, { center: 350, half: 30 }) // from 320 to 20 degrees, across north
  const ring = relief.radiiM.findIndex((r) => r > 10000)
  for (const az of [320, 350, 0, 20]) assert.equal(out[ring * RELIEF_AZIMUTHS + az], all[ring * RELIEF_AZIMUTHS + az], `azimuth ${az}`)
  for (const az of [60, 180, 300]) assert.equal(out[ring * RELIEF_AZIMUTHS + az], -99, `azimuth ${az}`)
  assert.equal(out[0], 7) // the ground at the feet is always filled
})

test('the picture of regolith repeats, keeps its numbers, and is the same every time', () => {
  const a = makeRegolithData(64, 7)
  const b = makeRegolithData(64, 7)
  assert.deepEqual(a.data, b.data)
  assert.equal(a.data.length, 64 * 64 * 4)
  assert.ok(a.heightRange > 0 && a.slopeScale > 0 && a.meanHeight > 0 && a.meanHeight < 1)
  // Heights use the whole byte range; slopes are centered on "flat".
  let low = 255
  let high = 0
  let slopeSum = 0
  for (let i = 0; i < 64 * 64; i++) {
    low = Math.min(low, a.data[i * 4])
    high = Math.max(high, a.data[i * 4])
    slopeSum += a.data[i * 4 + 1]
  }
  assert.equal(low, 0)
  assert.equal(high, 255)
  assert.ok(Math.abs(slopeSum / (64 * 64) - 127.5) < 6)
})
