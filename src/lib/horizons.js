// JPL Horizons client: Sun and Earth azimuth/elevation as seen from a point on the Moon.
// API doc: https://ssd-api.jpl.nasa.gov/doc/horizons.html
//
// Horizons sends no CORS headers, so the browser cannot call it directly. These functions
// run on the server (api/horizons.js on Vercel, a Vite middleware in dev); the browser calls
// our own /api/horizons endpoint.
//
// NOTE: elevations are relative to the smooth reference sphere (airless Moon, no terrain).
// Terrain masking is applied separately, see src/lib/visibility.js.

export const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
export const BODY_IDS = { sun: '10', earth: '399' }
const MOON_CENTER = 'coord@301' // 301 = Moon, "coord@" = observer on a user-defined surface point

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

// Limits protect our endpoint from being used as an open proxy.
export const LIMITS = { maxRows: 3000, minStepMinutes: 10, maxStepMinutes: 1440, minYear: 1950, maxYear: 2100 }

/** Build the Horizons request URL for one body. `start`/`stop` are 'YYYY-MM-DD HH:MM' (UT). */
export function buildHorizonsUrl({ body, lat, lon, altKm = 0, start, stop, stepMinutes }) {
  if (!BODY_IDS[body]) throw new RangeError(`Unknown body: ${body}`)
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${BODY_IDS[body]}'`,
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: `'${MOON_CENTER}'`,
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${lon},${lat},${altKm}'`, // east longitude (deg), latitude (deg), altitude (km)
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${stepMinutes}m'`,
    // 4 = apparent azimuth and elevation. For the Sun also 13 = apparent angular diameter (arcsec) and 20 = distance to the observer
    // (delta, AU) and its rate: the irradiance is 1361 / delta^2 and the size of the disc sets the share of it behind the terrain.
    QUANTITIES: body === 'sun' ? "'4,13,20'" : "'4'",
    CSV_FORMAT: "'YES'",
    ANG_FORMAT: "'DEG'",
  })
  return `${HORIZONS_URL}?${params}`
}

/**
 * Parse the text of a Horizons response into [{ t, az, el }] (t = ISO string, UT). When the answer also holds the angular diameter
 * and the distance (the Sun request, columns 13 and 20), rows carry angDiamArcsec and deltaAu too.
 */
export function parseHorizonsResult(text) {
  const a = text.indexOf('$$SOE')
  const b = text.indexOf('$$EOE')
  if (a === -1 || b === -1) {
    const hint = text.split('\n').filter((l) => l.trim()).slice(0, 3).join(' | ')
    throw new Error(`Horizons returned no ephemeris: ${hint}`)
  }
  return text
    .slice(a + 5, b)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim())
      const m = /^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})/.exec(cols[0])
      const az = Number(cols[3])
      const el = Number(cols[4])
      const extra = (value) => (value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : undefined)
      const angDiamArcsec = extra(cols[5])
      const deltaAu = extra(cols[6])
      if (!m || !(m[2] in MONTHS) || Number.isNaN(az) || Number.isNaN(el)) {
        throw new Error(`Unreadable Horizons row: ${line}`)
      }
      const t = new Date(Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5])).toISOString()
      return deltaAu === undefined || angDiamArcsec === undefined ? { t, az, el } : { t, az, el, angDiamArcsec, deltaAu }
    })
}

// Horizons answers 503 when it gets several requests at once. So: one upstream request at a time
// (queue), a few retries on 503/429, and a small in-memory cache that also merges duplicate requests.
const MAX_RETRIES = 3
const CACHE_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 200
const DEFAULT_OPTIONS = { retryDelayMs: 1000, cache: true }
const cache = new Map() // url -> { at, promise }
let queue = Promise.resolve()

function enqueue(task) {
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchRows(url, fetchImpl, retryDelayMs, parse) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(25000) })
    if ((res.status === 503 || res.status === 429) && attempt < MAX_RETRIES) {
      await wait(retryDelayMs * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`)
    const json = await res.json()
    if (json.error) throw new Error(`Horizons error: ${json.error}`)
    return parse(json.result)
  }
}

// One upstream request: queued, retried, cached. `parse` turns the answer text into rows.
function fetchCached(url, parse, fetchImpl, options) {
  if (options.cache) {
    const hit = cache.get(url)
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise
  }
  const promise = enqueue(() => fetchRows(url, fetchImpl, options.retryDelayMs, parse))
  if (options.cache) {
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value)
    cache.set(url, { at: Date.now(), promise })
    promise.catch(() => cache.delete(url))
  }
  return promise
}

function fetchBody(body, params, fetchImpl, options) {
  return fetchCached(buildHorizonsUrl({ body, ...params }), parseHorizonsResult, fetchImpl, options)
}

// --- Sky: the point of the Moon under the Sun and under the Earth, and the Earth's distance -------------------

/** Request for the Moon seen from the Earth's center: sub-Earth point (14), sub-solar point (15), distance (20). */
export function buildSkyUrl({ start, stop, stepMinutes }) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: "'301'",
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'500@399'",
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${stepMinutes}m'`,
    QUANTITIES: "'14,15,20'",
    RANGE_UNITS: "'KM'",
    CSV_FORMAT: "'YES'",
    ANG_FORMAT: "'DEG'",
  })
  return `${HORIZONS_URL}?${params}`
}

/** Parse the sky answer into [{ t, earthLon, earthLat, sunLon, sunLat, earthKm }] (degrees east, km). */
export function parseSkyResult(text) {
  const a = text.indexOf('$$SOE')
  const b = text.indexOf('$$EOE')
  if (a === -1 || b === -1) {
    const hint = text.split('\n').filter((l) => l.trim()).slice(0, 3).join(' | ')
    throw new Error(`Horizons returned no ephemeris: ${hint}`)
  }
  return text
    .slice(a + 5, b)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim())
      const m = /^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})/.exec(cols[0])
      const [earthLon, earthLat, sunLon, sunLat, earthKm] = cols.slice(3, 8).map(Number)
      if (!m || !(m[2] in MONTHS) || [earthLon, earthLat, sunLon, sunLat, earthKm].some(Number.isNaN)) {
        throw new Error(`Unreadable Horizons row: ${line}`)
      }
      const t = new Date(Date.UTC(+m[1], MONTHS[m[2]], +m[3], +m[4], +m[5])).toISOString()
      return { t, earthLon, earthLat, sunLon, sunLat, earthKm }
    })
}

/** Sky samples for a period. Returns { start, stop, stepMinutes, samples }. */
export async function fetchSky(params, fetchImpl = fetch, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const samples = await fetchCached(buildSkyUrl(params), parseSkyResult, fetchImpl, opts)
  return { start: params.start, stop: params.stop, stepMinutes: params.stepMinutes, samples }
}

/** Sun and Earth az/el over time for one site. Returns { site, start, stop, stepMinutes, series }. */
export async function fetchSiteEphemeris(params, fetchImpl = fetch, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const [sun, earth] = await Promise.all([
    fetchBody('sun', params, fetchImpl, opts),
    fetchBody('earth', params, fetchImpl, opts),
  ])
  if (sun.length !== earth.length) throw new Error('Sun and Earth series have different lengths')
  const { lat, lon, altKm, start, stop, stepMinutes } = params
  return {
    site: { lat, lon, altKm },
    start,
    stop,
    stepMinutes,
    // sunDeltaAu (Sun-site distance, AU) and sunAngDiamArcsec (apparent diameter of the Sun) are there when Horizons gave them.
    series: sun.map((s, i) => ({
      t: s.t,
      sunAz: s.az,
      sunEl: s.el,
      earthAz: earth[i].az,
      earthEl: earth[i].el,
      ...(s.deltaAu !== undefined && { sunDeltaAu: s.deltaAu, sunAngDiamArcsec: s.angDiamArcsec }),
    })),
  }
}

function normalizeDate(value, name) {
  const v = String(value ?? '').trim().replace('T', ' ')
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(v)
  if (!m) throw new RangeError(`${name} must look like YYYY-MM-DD or YYYY-MM-DD HH:MM (UT)`)
  const text = `${m[1]}-${m[2]}-${m[3]} ${m[4] ?? '00'}:${m[5] ?? '00'}`
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:00Z`)
  if (Number.isNaN(ms) || +m[1] < LIMITS.minYear || +m[1] > LIMITS.maxYear) {
    throw new RangeError(`${name} is out of range (${LIMITS.minYear}-${LIMITS.maxYear})`)
  }
  return { text, ms }
}

function numberInRange(value, name, min, max) {
  const n = Number(value)
  if (value === undefined || value === '' || !Number.isFinite(n) || n < min || n > max) {
    throw new RangeError(`${name} must be a number between ${min} and ${max}`)
  }
  return n
}

/** Validate and normalize the period part of a query (start, stop, stepMinutes). */
export function parseTimeQuery(query) {
  const stepMinutes = Math.round(
    numberInRange(query.stepMinutes ?? 60, 'stepMinutes', LIMITS.minStepMinutes, LIMITS.maxStepMinutes),
  )
  const start = normalizeDate(query.start, 'start')
  const stop = normalizeDate(query.stop, 'stop')
  if (stop.ms <= start.ms) throw new RangeError('stop must be after start')
  const rows = Math.floor((stop.ms - start.ms) / (stepMinutes * 60000)) + 1
  if (rows > LIMITS.maxRows) throw new RangeError(`Too many rows (${rows}); maximum is ${LIMITS.maxRows}`)
  return { start: start.text, stop: stop.text, stepMinutes }
}

/** Validate and normalize query parameters (lat, lon, altKm, start, stop, stepMinutes). */
export function parseQuery(query) {
  const lat = numberInRange(query.lat, 'lat', -90, 90)
  const lon = numberInRange(query.lon, 'lon', -180, 360)
  const altKm = query.altKm === undefined ? 0 : numberInRange(query.altKm, 'altKm', -10, 10)
  return { lat, lon, altKm, ...parseTimeQuery(query) }
}

/** Request handler for /api/sky (same shape as handleRequest). */
export async function handleSkyRequest(query, fetchImpl = fetch, options = {}) {
  let params
  try {
    params = parseTimeQuery(query)
  } catch (e) {
    return { status: 400, body: { error: e.message } }
  }
  try {
    const body = await fetchSky(params, fetchImpl, options)
    return { status: 200, body, cache: 'public, s-maxage=86400, stale-while-revalidate=604800' }
  } catch (e) {
    return { status: 502, body: { error: `Upstream error: ${e.message}` } }
  }
}

/** Shared request handler for the Vercel function and the Vite dev middleware. */
export async function handleRequest(query, fetchImpl = fetch, options = {}) {
  let params
  try {
    params = parseQuery(query)
  } catch (e) {
    return { status: 400, body: { error: e.message } }
  }
  try {
    const body = await fetchSiteEphemeris(params, fetchImpl, options)
    // Ephemerides never change for given inputs: let the CDN cache them for a day.
    return { status: 200, body, cache: 'public, s-maxage=86400, stale-while-revalidate=604800' }
  } catch (e) {
    return { status: 502, body: { error: `Upstream error: ${e.message}` } }
  }
}
