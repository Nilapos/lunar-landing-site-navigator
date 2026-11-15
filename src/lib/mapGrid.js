// The graticule of the map (latitude circles and meridians with their values, like a cartographic map) and the candidate region squares,
// drawn for a window of the map plane (see tileGrid.js): the lines get closer as the window zooms in, with a step that stays readable
// (2 degrees of latitude for the whole cap, 0.005 degree, 150 m, for the smallest window).
import { MAP_RADIUS_KM, REGION_SIZE_KM, polarRadiusKm } from './polarMap.js'
import { MOON_RADIUS_M } from './terrain.js'

const RAD = Math.PI / 180
const R_KM = MOON_RADIUS_M / 1000
const KM_PER_DEG_AT_POLE = (R_KM * Math.PI) / 180 // 30.32 km per degree of latitude (a little more away from the pole)
const LINES_ACROSS = 5 // about this many latitude lines across a window

export const LAT_STEPS = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005]
export const LON_STEPS = [90, 45, 30, 15, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005]
const MAX_LINES = 64

// The largest step of a list that is not above `target` (the smallest when all are).
const stepAtMost = (steps, target) => steps.find((s) => s <= target) ?? steps[steps.length - 1]

/** Step between latitude circles (degrees) for a window of `spanKm`. */
export const latStepFor = (spanKm) => stepAtMost(LAT_STEPS, spanKm / (KM_PER_DEG_AT_POLE * LINES_ACROSS))

/** Latitude (deg) of a distance from the pole (km): inverse of polarRadiusKm. */
export const latOfRadius = (rhoKm) => -90 + 2 * Math.atan(rhoKm / (2 * R_KM)) / RAD

/** Distance from the pole (km) and angle from the lon 0 axis toward the east (rad) of a map plane point. */
export const polarOf = (x, y) => ({ rho: Math.hypot(x, y), theta: Math.atan2(x, y) })

/** Does the window contain (or nearly contain) the pole? Then the meridians all meet in it and a fixed step is used. */
const holdsPole = (win) => Math.hypot(win.cx, win.cy) < win.span * 0.6

/** Step between meridians (degrees): by the width a degree of longitude has at the distance of the window from the pole. */
export function lonStepFor(win) {
  if (holdsPole(win)) return win.span >= 150 ? 30 : win.span >= 40 ? 15 : win.span >= 10 ? 5 : 1
  const rho = Math.hypot(win.cx, win.cy)
  return stepAtMost(LON_STEPS, ((win.span / LINES_ACROSS) / rho) / RAD)
}

/**
 * The lines to draw for a window: { parallels: [{ lat, rho }], meridians: [{ lon }], latStep, lonStep }. Only the ones that can meet the
 * window (with a margin), at most MAX_LINES of each.
 */
export function gridLines(win) {
  const latStep = latStepFor(win.span)
  const lonStep = lonStepFor(win)
  const reach = win.span * 0.75
  const { rho: rhoC, theta: thetaC } = polarOf(win.cx, win.cy)

  const parallels = []
  const latLow = latOfRadius(Math.max(0, rhoC - reach))
  const latHigh = Math.min(-80, latOfRadius(rhoC + reach))
  for (let k = Math.ceil((latLow + 90) / latStep); parallels.length < MAX_LINES; k++) {
    const lat = Math.round((-90 + k * latStep) * 1e6) / 1e6
    if (lat > latHigh) break
    if (lat <= -90) continue
    parallels.push({ lat, rho: polarRadiusKm(lat) })
  }

  const meridians = []
  const around = holdsPole(win) ? Math.PI : Math.asin(Math.min(1, reach / rhoC))
  const lonLow = (thetaC - around) / RAD
  const lonHigh = (thetaC + around) / RAD
  for (let k = Math.ceil(lonLow / lonStep); meridians.length < MAX_LINES; k++) {
    const lon = k * lonStep
    if (lon > lonHigh) break
    meridians.push({ lon: ((lon % 360) + 360) % 360 })
  }
  return { parallels, meridians, latStep, lonStep }
}

const trim = (v, decimals) => String(Number(v.toFixed(decimals)))
const decimalsFor = (step) => Math.max(0, Math.ceil(-Math.log10(step) - 1e-9))

/** "85.5°S" style label of a (southern) latitude for a step between circles. */
export const formatLat = (lat, step) => `${trim(Math.abs(lat), decimalsFor(step))}°S`

/** "30°E" / "120°W" label of a longitude (0..360 east) for a step between meridians. */
export function formatLon(lon, step) {
  const east = lon <= 180
  const value = east ? lon : 360 - lon
  return `${trim(value, decimalsFor(step))}°${value === 0 || value === 180 ? '' : east ? 'E' : 'W'}`
}

/**
 * Draws the graticule with its labels, and the candidate region squares, for `win` on `canvas` (square, cleared first).
 *   colors: { grid, regionFill, regionEdge } (see cssTokens.js); regions: [{ lat, lon }]
 */
export function paintWindowGrid(canvas, win, { regions = [], colors }) {
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, size, size)
  const left = win.cx - win.span / 2
  const top = win.cy + win.span / 2
  const scale = size / win.span // pixels per km
  const px = (x) => (x - left) * scale
  const py = (y) => (top - y) * scale
  const { parallels, meridians, latStep, lonStep } = gridLines(win)
  const { rho: rhoC, theta: thetaC } = polarOf(win.cx, win.cy)
  const reach = win.span * 0.75
  const line = Math.max(2, size / 512)

  ctx.save()
  ctx.lineWidth = line
  ctx.strokeStyle = colors.grid
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (const { rho } of parallels) {
    const half = holdsPole(win) || rho < reach ? Math.PI : Math.min(Math.PI, reach / rho)
    const segments = Math.max(16, Math.min(180, Math.ceil((2 * half * rho * scale) / 40)))
    for (let s = 0; s <= segments; s++) {
      const a = thetaC - half + (2 * half * s) / segments
      const x = px(rho * Math.sin(a))
      const y = py(rho * Math.cos(a))
      if (s === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
  }
  for (const { lon } of meridians) {
    const a = lon * RAD
    const r0 = Math.max(0, rhoC - reach * 1.5)
    const r1 = Math.min(MAP_RADIUS_KM * 1.02, rhoC + reach * 1.5)
    ctx.moveTo(px(r0 * Math.sin(a)), py(r0 * Math.cos(a)))
    ctx.lineTo(px(r1 * Math.sin(a)), py(r1 * Math.cos(a)))
  }
  ctx.stroke()

  // Candidate regions: translucent squares with a bright edge, as in NASA's Artemis III videos.
  ctx.fillStyle = colors.regionFill
  ctx.strokeStyle = colors.regionEdge
  const half = (REGION_SIZE_KM / 2) * scale
  const fillRegions = win.span > REGION_SIZE_KM * 4 // zoomed in, a region would hide what it frames: only its outline is drawn
  for (const r of regions) {
    const rho = polarRadiusKm(r.lat)
    const cx = px(rho * Math.sin(r.lon * RAD))
    const cy = py(rho * Math.cos(r.lon * RAD))
    if (cx < -half || cy < -half || cx > size + half || cy > size + half) continue
    if (fillRegions) ctx.fillRect(cx - half, cy - half, 2 * half, 2 * half)
    ctx.strokeRect(cx - half, cy - half, 2 * half, 2 * half)
  }

  // Values: each circle where it is nearest the middle of the window, each meridian at the distance of the middle from the pole.
  const fontPx = Math.max(18, Math.round(size / 60))
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = fontPx / 4
  ctx.lineJoin = 'round'
  const label = (text, x, y) => {
    if (x < fontPx || y < fontPx || x > size - fontPx || y > size - fontPx) return
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'
    ctx.strokeText(text, x, y)
    ctx.fillStyle = colors.grid
    ctx.fillText(text, x, y)
  }
  for (const { lat, rho } of parallels) {
    const a = rho < reach ? 0 : thetaC // near the pole the circle is whole: put the value on its top
    label(formatLat(lat, latStep), px(rho * Math.sin(a)), py(rho * Math.cos(a)) - fontPx * 0.9)
  }
  const along = Math.max(rhoC, win.span * 0.12)
  for (const { lon } of meridians) {
    const a = lon * RAD
    label(formatLon(lon, lonStep), px(along * Math.sin(a)), py(along * Math.cos(a)) + fontPx * 0.9)
  }
  ctx.restore()
}
