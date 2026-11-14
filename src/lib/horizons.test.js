import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildHorizonsUrl,
  buildSkyUrl,
  handleRequest,
  handleSkyRequest,
  parseHorizonsResult,
  parseQuery,
  parseSkyResult,
} from './horizons.js'

const NO_WAIT = { retryDelayMs: 0, cache: false }

const SAMPLE = `header
$$SOE
 2026-Nov-14 00:00,*, , 228.998501,    -4.713855,
 2026-Nov-14 01:00,*, , 228.940746,    -4.671740,
$$EOE
footer`

test('parseHorizonsResult reads CSV rows', () => {
  const rows = parseHorizonsResult(SAMPLE)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { t: '2026-11-14T00:00:00.000Z', az: 228.998501, el: -4.713855 })
  assert.equal(rows[1].t, '2026-11-14T01:00:00.000Z')
})

test('parseHorizonsResult explains upstream errors', () => {
  assert.throws(() => parseHorizonsResult('No ephemeris for target'), /no ephemeris/)
})

test('buildHorizonsUrl targets the Moon surface point', () => {
  const url = new URL(buildHorizonsUrl({ body: 'earth', lat: -89.9, lon: 129.78, altKm: 0, start: '2026-11-14 00:00', stop: '2026-11-15 00:00', stepMinutes: 60 }))
  assert.equal(url.searchParams.get('COMMAND'), "'399'")
  assert.equal(url.searchParams.get('CENTER'), "'coord@301'")
  assert.equal(url.searchParams.get('SITE_COORD'), "'129.78,-89.9,0'")
})

test('parseQuery validates and normalizes', () => {
  const p = parseQuery({ lat: '-89.9', lon: '129.78', start: '2026-11-14', stop: '2026-11-15T12:00', stepMinutes: '30' })
  assert.deepEqual(p, { lat: -89.9, lon: 129.78, altKm: 0, start: '2026-11-14 00:00', stop: '2026-11-15 12:00', stepMinutes: 30 })
})

test('parseQuery rejects bad input', () => {
  const ok = { lat: '-89', lon: '0', start: '2026-11-14', stop: '2026-11-15' }
  assert.throws(() => parseQuery({ ...ok, lat: '120' }), /lat/)
  assert.throws(() => parseQuery({ ...ok, lat: undefined }), /lat/)
  assert.throws(() => parseQuery({ ...ok, start: 'tomorrow' }), /start/)
  assert.throws(() => parseQuery({ ...ok, stop: '2026-11-13' }), /after/)
  assert.throws(() => parseQuery({ ...ok, stop: '2026-12-31', stepMinutes: '10' }), /Too many rows/)
})

test('handleRequest merges Sun and Earth series', async () => {
  const fakeFetch = async (url) => {
    const isSun = new URL(url).searchParams.get('COMMAND') === "'10'"
    const el = isSun ? '1.0' : '2.0'
    return { ok: true, json: async () => ({ result: `$$SOE\n 2026-Nov-14 00:00,*, , 10.0, ${el},\n$$EOE` }) }
  }
  const out = await handleRequest({ lat: '-89.9', lon: '0', start: '2026-11-14', stop: '2026-11-14 00:30', stepMinutes: '10' }, fakeFetch, NO_WAIT)
  assert.equal(out.status, 200)
  assert.deepEqual(out.body.series[0], { t: '2026-11-14T00:00:00.000Z', sunAz: 10, sunEl: 1, earthAz: 10, earthEl: 2 })
})

const SKY_TEXT = `header
$$SOE
 2026-Nov-14 00:00, , , 358.776460,   4.403300,  126.617658,  -1.557279,  4.0561589143E+05, -0.0031111,
 2026-Nov-14 01:00, , , 358.718730,   4.361088,  126.109792,  -1.557290,  4.0560374729E+05, -0.0036356,
$$EOE`

test('parseSkyResult reads sub-Earth, sub-solar points and the Earth distance', () => {
  const rows = parseSkyResult(SKY_TEXT)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    t: '2026-11-14T00:00:00.000Z',
    earthLon: 358.77646,
    earthLat: 4.4033,
    sunLon: 126.617658,
    sunLat: -1.557279,
    earthKm: 405615.89143,
  })
  assert.throws(() => parseSkyResult('nothing here'), /no ephemeris/)
})

test('buildSkyUrl asks for the Moon seen from the Earth with quantities 14, 15 and 20 in km', () => {
  const url = new URL(buildSkyUrl({ start: '2026-11-14 00:00', stop: '2026-11-15 00:00', stepMinutes: 60 }))
  assert.equal(url.searchParams.get('COMMAND'), "'301'")
  assert.equal(url.searchParams.get('CENTER'), "'500@399'")
  assert.equal(url.searchParams.get('QUANTITIES'), "'14,15,20'")
  assert.equal(url.searchParams.get('RANGE_UNITS'), "'KM'")
})

test('handleSkyRequest validates the period and returns the samples', async () => {
  assert.equal((await handleSkyRequest({})).status, 400)
  assert.equal((await handleSkyRequest({ start: '2026-11-14', stop: '2026-11-13' })).status, 400)
  const fakeFetch = async () => ({ ok: true, json: async () => ({ result: SKY_TEXT }) })
  const out = await handleSkyRequest({ start: '2026-11-14', stop: '2026-11-14 01:00', stepMinutes: '60' }, fakeFetch, NO_WAIT)
  assert.equal(out.status, 200)
  assert.equal(out.body.samples.length, 2)
  assert.equal(out.body.stepMinutes, 60)
})

test('handleRequest returns 400 on bad input and 502 on upstream failure', async () => {
  assert.equal((await handleRequest({})).status, 400)
  const failing = async () => ({ ok: false, status: 500 })
  const out = await handleRequest({ lat: '-89', lon: '0', start: '2026-11-14', stop: '2026-11-15' }, failing, NO_WAIT)
  assert.equal(out.status, 502)
})

test('handleRequest retries when Horizons answers 503', async () => {
  const calls = new Map()
  const flaky = async (url) => {
    const n = (calls.get(url) ?? 0) + 1
    calls.set(url, n)
    if (n === 1) return { ok: false, status: 503 }
    return { ok: true, json: async () => ({ result: '$$SOE\n 2026-Nov-14 00:00,*, , 10.0, 1.0,\n$$EOE' }) }
  }
  const out = await handleRequest({ lat: '-89', lon: '0', start: '2026-11-14', stop: '2026-11-14 00:30', stepMinutes: '10' }, flaky, NO_WAIT)
  assert.equal(out.status, 200)
  assert.ok([...calls.values()].every((n) => n === 2))
})

test('only one upstream request runs at a time', async () => {
  let running = 0
  let maxRunning = 0
  const slow = async () => {
    running++
    maxRunning = Math.max(maxRunning, running)
    await new Promise((resolve) => setTimeout(resolve, 5))
    running--
    return { ok: true, json: async () => ({ result: '$$SOE\n 2026-Nov-14 00:00,*, , 10.0, 1.0,\n$$EOE' }) }
  }
  const q = { start: '2026-11-14', stop: '2026-11-14 00:30', stepMinutes: '10' }
  await Promise.all([
    handleRequest({ lat: '-80', lon: '0', ...q }, slow, NO_WAIT),
    handleRequest({ lat: '-81', lon: '0', ...q }, slow, NO_WAIT),
  ])
  assert.equal(maxRunning, 1)
})

test('identical requests are served from the cache', async () => {
  let calls = 0
  const counting = async () => {
    calls++
    return { ok: true, json: async () => ({ result: '$$SOE\n 2026-Nov-14 00:00,*, , 10.0, 1.0,\n$$EOE' }) }
  }
  const q = { lat: '-83.5', lon: '12', start: '2026-11-14', stop: '2026-11-14 00:30', stepMinutes: '10' }
  await handleRequest(q, counting, { retryDelayMs: 0 })
  await handleRequest(q, counting, { retryDelayMs: 0 })
  assert.equal(calls, 2) // Sun + Earth once each, the second request is cached
})
