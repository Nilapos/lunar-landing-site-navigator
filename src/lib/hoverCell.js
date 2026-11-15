// The cell under the pointer, at the finest resolution there is data for: a cell of the fine zone around the selected site (100 to 250 m)
// when the pointer is on it, else a cell of a loaded 500 m chunk, else the cell of the 2.4 km overview. The card of the hover and the
// reticle of the cursor are about that cell, so zooming in lets one aim at the small tiles a lander could use.
import { MAP_RADIUS_KM } from './polarMap.js'
import { MOON_RADIUS_M } from './terrain.js'

const DEG = 180 / Math.PI
const R_KM = MOON_RADIUS_M / 1000

/** The cell of a zone (see zones.js) or chunk that contains a point of the map plane (km): { i, j, index, cx, cy } (cx, cy: its center), or null. */
export function cellAt(zone, xKm, yKm) {
  const n = zone.cells
  const i = Math.floor(((xKm - zone.centerXKm) / zone.sizeKm + 0.5) * n)
  const j = Math.floor((0.5 - (yKm - zone.centerYKm) / zone.sizeKm) * n)
  if (i < 0 || j < 0 || i >= n || j >= n) return null
  return {
    i,
    j,
    index: j * n + i,
    cx: zone.centerXKm + ((i + 0.5) / n - 0.5) * zone.sizeKm,
    cy: zone.centerYKm - ((j + 0.5) / n - 0.5) * zone.sizeKm,
  }
}

/** Center (km) and side (km) of a cell of the 2.4 km overview grid (`grid` cells across the map, rows from the top). */
export function overviewCell(grid, index) {
  const width = 2 * MAP_RADIUS_KM
  const gx = index % grid
  const gy = (index - gx) / grid
  return { cx: ((gx + 0.5) / grid - 0.5) * width, cy: (0.5 - (gy + 0.5) / grid) * width, sizeKm: width / grid }
}

/** Latitude and east longitude (deg) of a point of the map plane (km). */
export function latLonOfMapPoint(xKm, yKm) {
  const rho = Math.hypot(xKm, yKm)
  return { lat: -90 + 2 * Math.atan(rho / (2 * R_KM)) * DEG, lon: (Math.atan2(xKm, yKm) * DEG + 360) % 360 }
}

/**
 * The finest cell at a point of the map plane.
 *   overview: { terrain, frames, grid, index }: the 2.4 km terrain and the index of its cell under the pointer;
 *   zone: { zone, frames } of the fine zone when it is shown, or null;  chunks: the loaded 500 m chunks (each with its frames).
 * Returns { key, level: 'zone' | 'chunk' | 'overview', terrain, frames, index, cx, cy, sizeKm } where key identifies the cell (it changes
 * when the pointer moves to another cell, not within one).
 */
export function finestCell(xKm, yKm, { overview, zone = null, chunks = [] }) {
  if (zone) {
    const c = cellAt(zone.zone, xKm, yKm)
    if (c) return { key: `zone:${zone.zone.id}:${c.index}`, level: 'zone', terrain: zone.zone, frames: zone.frames, index: c.index, cx: c.cx, cy: c.cy, sizeKm: zone.zone.sizeKm / zone.zone.cells }
  }
  for (const chunk of chunks) {
    const c = cellAt(chunk, xKm, yKm)
    if (c) return { key: `chunk:${chunk.centerXKm}:${chunk.centerYKm}:${c.index}`, level: 'chunk', terrain: chunk, frames: chunk.frames, index: c.index, cx: c.cx, cy: c.cy, sizeKm: chunk.sizeKm / chunk.cells }
  }
  const o = overviewCell(overview.grid, overview.index)
  return { key: `overview:${overview.index}`, level: 'overview', terrain: overview.terrain, frames: overview.frames, index: overview.index, ...o }
}

/** How a cell size reads in the interface: "125 m cell", "500 m cell", "2.4 km cell". */
export function cellLabel(sizeKm) {
  return sizeKm < 1 ? `${Math.round(sizeKm * 1000)} m cell` : `${sizeKm.toFixed(1)} km cell`
}

/**
 * Side (km) the reticle is drawn with: the size of the cell, but never smaller than `minPixels` on the screen, so it can still be aimed at
 * when the cell is only a few pixels wide.
 *   distanceKm: camera to target; fovDeg: vertical field of view; viewportPx: height of the view in pixels.
 */
export function reticleSideKm(cellKm, distanceKm, fovDeg, viewportPx, minPixels = 22) {
  const visibleKm = 2 * distanceKm * Math.tan((fovDeg * Math.PI) / 360)
  return Math.max(cellKm, (visibleKm * minPixels) / Math.max(viewportPx, 1))
}
