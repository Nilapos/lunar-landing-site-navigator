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

/** Approximate width of an Artemis III candidate region (NASA SVS 5013 shows each as a square about 15 km wide). */
export const REGION_SIZE_KM = 15

/**
 * The square drawn for a candidate region, as in NASA's Artemis III videos: centered on the point, sides along the
 * map axes. Returns the top-left corner and the side, all as fractions of the map width.
 */
export function regionSquare(latDeg, lonDeg, sizeKm = REGION_SIZE_KM) {
  const { x, y } = projectToMap(latDeg, lonDeg)
  const side = sizeKm / (2 * MAP_RADIUS_KM)
  return { x: x - side / 2, y: y - side / 2, side }
}

/** Graticule of the videos: latitude circles every 2 degrees and meridians every 30 degrees. */
export const GRID_LATS = [-88, -86, -84, -82]
export const GRID_LONS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
