// Where are the Sun and the Earth in the sky of ANY point of the Moon, from just two numbers per body:
// the point of the Moon right under it (sub-solar and sub-Earth points, from Horizons) and, for the Earth,
// its distance. This lets the 3D view color the whole terrain without asking Horizons for each point.
//
// Frame: Moon-fixed (mean Earth / polar axis, as the LOLA map and Horizons), east longitude, x toward lon 0,
// z toward the north pole. Azimuth is 0 = north, 90 = east.
import { MOON_RADIUS_M } from './terrain.js'

const RAD = Math.PI / 180
const R_KM = MOON_RADIUS_M / 1000

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Unit vector of a point (lat, lon in degrees) of the Moon. */
export function unitVector(latDeg, lonDeg) {
  const lat = latDeg * RAD
  const lon = lonDeg * RAD
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
}

/** Local up, east and north unit vectors at a point. */
export function localFrame(latDeg, lonDeg) {
  const lat = latDeg * RAD
  const lon = lonDeg * RAD
  return {
    up: unitVector(latDeg, lonDeg),
    east: [-Math.sin(lon), Math.cos(lon), 0],
    north: [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)],
  }
}

/** Azimuth (0..360) and elevation (deg) of a direction as seen from a point with the given local frame. */
export function azEl(frame, direction) {
  const el = Math.asin(Math.max(-1, Math.min(1, dot(direction, frame.up)))) / RAD
  const az = (Math.atan2(dot(direction, frame.east), dot(direction, frame.north)) / RAD + 360) % 360
  return { az, el }
}

/**
 * Unit vector from a point of the Moon (given by its local up vector) to the Earth. The Earth is close enough for
 * its direction to change by up to a quarter of a degree across the Moon, which matters near the horizon.
 * `e` is the unit vector of the sub-Earth point; pass it in when calling many times with the same one.
 */
export function earthDirection(siteUp, subEarthLatDeg, subEarthLonDeg, earthKm, e = unitVector(subEarthLatDeg, subEarthLonDeg)) {
  const v = [e[0] * earthKm - siteUp[0] * R_KM, e[1] * earthKm - siteUp[1] * R_KM, e[2] * earthKm - siteUp[2] * R_KM]
  const n = Math.hypot(v[0], v[1], v[2])
  return [v[0] / n, v[1] / n, v[2] / n]
}

/**
 * Sun and Earth az/el at a point for one sample { sunLon, sunLat, earthLon, earthLat, earthKm }
 * (see the /api/sky endpoint). The Sun is far enough to ignore parallax.
 */
export function skyAt(latDeg, lonDeg, sample) {
  const frame = localFrame(latDeg, lonDeg)
  const sun = azEl(frame, unitVector(sample.sunLat, sample.sunLon))
  const earth = azEl(frame, earthDirection(frame.up, sample.earthLat, sample.earthLon, sample.earthKm))
  return { sunAz: sun.az, sunEl: sun.el, earthAz: earth.az, earthEl: earth.el }
}
