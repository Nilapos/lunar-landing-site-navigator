// Map of the south polar region: same polar stereographic projection as the LOLA map (see terrain.js),
// reduced to fractions of the picture so it works at any display size. Longitude 0 is at the top,
// 90 E to the right. The picture covers 80 S to the pole.
import { MOON_RADIUS_M } from './terrain.js'

const RAD = Math.PI / 180

export const MAP_MIN_LAT = -80

/** Distance from the pole (km) in the projection for a latitude. */
export function polarRadiusKm(latDeg) {
  return (2 * MOON_RADIUS_M * Math.tan(((latDeg + 90) * RAD) / 2)) / 1000
}

/** Radius of the map edge (km): where the projection reaches MAP_MIN_LAT. */
export const MAP_RADIUS_KM = polarRadiusKm(MAP_MIN_LAT)

/** Position as fractions of the map's width (x, to the right) and height (y, downward), 0..1. */
export function projectToMap(latDeg, lonDeg) {
  const rho = polarRadiusKm(latDeg)
  const lon = lonDeg * RAD
  return {
    x: 0.5 + (rho * Math.sin(lon)) / (2 * MAP_RADIUS_KM),
    y: 0.5 - (rho * Math.cos(lon)) / (2 * MAP_RADIUS_KM),
  }
}

/** Radius of a latitude circle as a fraction of the map width (0.5 = the edge). */
export function circleRadius(latDeg) {
  return polarRadiusKm(latDeg) / (2 * MAP_RADIUS_KM)
}
