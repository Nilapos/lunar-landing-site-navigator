// Geometry and wording of the "Polar sky" view, without any 3D library so it can be tested.
//
// Frame: Moon-fixed (mean Earth / polar axis), kilometers, x toward lon 0, y toward lon 90 E, z north (as sky.js).
// The Moon is a sphere of radius 1737.4 km at the origin, so the south pole is at (0, 0, -R).
import { cellLatLon } from './illumination.js'
import { projectToMap } from './polarMap.js'
import { skyAt, unitVector } from './sky.js'
import { MOON_RADIUS_M } from './terrain.js'
import { sampleHeight } from './terrain3d.js'
import { horizonAt } from './visibility.js'

const RAD = Math.PI / 180
export const MOON_RADIUS_KM = MOON_RADIUS_M / 1000
export const EARTH_RADIUS_KM = 6371
/** The Sun is 0.53 degrees wide seen from the Moon (it barely changes over a year). */
export const SUN_ANGULAR_RADIUS_DEG = 0.265

/**
 * Relief factor near the edge of the map: 1 inside, falling smoothly to 0 at the 80 S circle, so the cap
 * meets the smooth sphere around it without a step. `edge` = distance from the pole / map radius.
 */
export function edgeTaper(edge) {
  const t = Math.min(Math.max((0.985 - edge) / 0.085, 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Positions (km) of the cap's vertices, one per grid cell center, on the sphere plus the relief times
 * `exaggeration`. Returns a Float32Array(grid * grid * 3); pass `out` to reuse one.
 */
export function capPositions(terrain, exaggeration, out = new Float32Array(terrain.grid ** 2 * 3)) {
  const N = terrain.grid
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const c = gy * N + gx
      const { lat, lon, edge } = cellLatLon(N, gx, gy)
      const u = unitVector(lat, lon)
      const r = MOON_RADIUS_KM + (terrain.heights[c] / 1000) * exaggeration * edgeTaper(edge)
      out[c * 3] = u[0] * r
      out[c * 3 + 1] = u[1] * r
      out[c * 3 + 2] = u[2] * r
    }
  }
  return out
}

/** Triangles of the cap (two per square of four neighbor cells), only where all four are inside the 80 S circle. */
export function capIndices(grid) {
  const inside = new Uint8Array(grid * grid)
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) inside[gy * grid + gx] = cellLatLon(grid, gx, gy).edge <= 1 ? 1 : 0
  }
  const out = []
  for (let gy = 0; gy < grid - 1; gy++) {
    for (let gx = 0; gx < grid - 1; gx++) {
      const a = gy * grid + gx
      const b = a + 1
      const c = a + grid
      const d = c + 1
      if (inside[a] && inside[b] && inside[c] && inside[d]) out.push(a, c, b, b, c, d)
    }
  }
  return new Uint32Array(out)
}

/** Position (km) of a point of the map on the exaggerated relief, `liftKm` above the ground. */
export function surfacePoint(terrain, latDeg, lonDeg, exaggeration, liftKm = 0) {
  const { x, y } = projectToMap(latDeg, lonDeg)
  const edge = Math.hypot(x - 0.5, y - 0.5) * 2
  const r = MOON_RADIUS_KM + (sampleHeight(terrain, x, y) / 1000) * exaggeration * edgeTaper(edge) + liftKm
  return unitVector(latDeg, lonDeg).map((v) => v * r)
}

/** Unit vector toward the Sun (the same from everywhere on the Moon: it is 150 million km away). */
export function sunDirection(sample) {
  return unitVector(sample.sunLat, sample.sunLon)
}

/** Position (km) of the Earth's center. */
export function earthPosition(sample) {
  return unitVector(sample.earthLat, sample.earthLon).map((v) => v * sample.earthKm)
}

/** Angular radius (deg) of a sphere of radius `radiusKm` seen from `distanceKm`. */
export function angularRadiusDeg(radiusKm, distanceKm) {
  return Math.asin(Math.min(1, radiusKm / distanceKm)) / RAD
}

/**
 * Where to draw a body so that it shows at its true direction and true angular size from the camera, without
 * putting it at its real distance: on the camera-to-body line, `displayKm` from the camera.
 *   camera: [x, y, z] km;  body: { position: [x, y, z] km, radiusKm }  or  { direction: unit vector, angularRadiusDeg }
 * Returns { position, radius (km, of the sphere to draw there), direction, angularRadiusDeg }.
 */
export function placeBody(camera, body, displayKm) {
  let direction = body.direction
  let angular = body.angularRadiusDeg
  if (body.position) {
    const v = [body.position[0] - camera[0], body.position[1] - camera[1], body.position[2] - camera[2]]
    const distance = Math.hypot(v[0], v[1], v[2])
    direction = v.map((x) => x / distance)
    angular = angularRadiusDeg(body.radiusKm, distance)
  }
  return {
    position: [camera[0] + direction[0] * displayKm, camera[1] + direction[1] * displayKm, camera[2] + direction[2] * displayKm],
    // A sphere of this radius at this distance has exactly that angular radius (tangent lines, hence the sine).
    radius: displayKm * Math.sin(angular * RAD),
    direction,
    angularRadiusDeg: angular,
  }
}

/**
 * Sun and Earth seen from a site at one instant, against its terrain horizon (360-value profile):
 * { sun, earth }, each { az, el, horizon, min, margin, visible }. Same margin as the analysis (marginSeries).
 */
export function siteBodyStates(site, sample, profile, { minSunDeg = 0, minEarthDeg = 0 } = {}) {
  const sky = skyAt(site.lat, site.lon, sample)
  const state = (az, el, min) => {
    const horizon = horizonAt(profile, az)
    const margin = el - horizon - min
    return { az, el, horizon, min, margin, visible: margin > 0 }
  }
  return { sun: state(sky.sunAz, sky.sunEl, minSunDeg), earth: state(sky.earthAz, sky.earthEl, minEarthDeg) }
}

const signed = (deg) => `${deg >= 0 ? '+' : '−'}${Math.abs(deg).toFixed(1)}°`

/**
 * The cause in words: "Sun +0.9° is under the +3.2° ridge (hidden)".
 * A horizon above half a degree is called a ridge; below, it is just the horizon.
 */
export function causeText(name, state) {
  const relief = state.horizon >= 0.5 ? 'ridge' : 'horizon'
  const body = `${name} ${signed(state.el)}`
  if (state.visible) return `${body} is above the ${signed(state.horizon)} ${relief} (visible)`
  if (state.el > state.horizon) {
    return `${body} is less than ${state.min}° above the ${signed(state.horizon)} ${relief} (too low)`
  }
  return `${body} is under the ${signed(state.horizon)} ${relief} (hidden)`
}

/** Unit vector of a direction given by its azimuth (0 = north, 90 = east) and elevation (deg) in a local frame (sky.js). */
export function horizonDirection(frame, azDeg, elDeg) {
  const az = azDeg * RAD
  const el = elDeg * RAD
  const n = Math.cos(el) * Math.cos(az)
  const e = Math.cos(el) * Math.sin(az)
  const u = Math.sin(el)
  return [0, 1, 2].map((i) => frame.north[i] * n + frame.east[i] * e + frame.up[i] * u)
}

/**
 * Elevations (deg) of the rings of the ground drawn around a standing observer, for one azimuth: from the feet
 * up to the terrain horizon `horizonDeg`, which is the last ring. The rings below never cross the horizon.
 */
export function groundRings(horizonDeg) {
  return [-89, Math.min(-30, horizonDeg - 12), Math.min(-8, horizonDeg - 4), horizonDeg - 1.2, horizonDeg]
}

/**
 * Texture coordinates (u, v) of a direction (unit vector, z north) in the azimuthal picture of makeMoonCanvas:
 * the distance from the south pole is the radius (north pole at the edge), the longitude the angle.
 */
export function polarUv(x, y, z) {
  const theta = Math.acos(Math.min(1, Math.max(-1, -z)))
  const rho = theta / Math.PI
  const phi = Math.atan2(y, x)
  return [0.5 + 0.5 * rho * Math.cos(phi), 0.5 - 0.5 * rho * Math.sin(phi)] // v is measured from the bottom of the picture
}
