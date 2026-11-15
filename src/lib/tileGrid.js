// The tile grid of NASA Moon Trek's south polar layers (WMTS, tile matrix set "default028mm"), and the windows of the map we draw from it.
//
// Every south polar layer of Moon Trek shares the same grid: the polar stereographic square of 2 x 1095.93 km around the pole (x east,
// y toward longitude 0, the same plane as polarMap.js), cut into 2^level x 2^level tiles of 256 pixels. Level L therefore has tiles of
// 2191.86 / 2^L km and pixels of 8562 / 2^L meters. A tile of level L, row r (from the top), column c is
//   https://trek.nasa.gov/tiles/Moon/SP/<layer>/1.0.0/default/default028mm/<L>/<r>/<c>.png
// The capabilities documents list more levels than the server holds (the real last level is the listed count minus 3, checked on
// 2026-11-15, see TILE_LAYERS), and a missing tile answers 404.
import { MAP_RADIUS_KM } from './polarMap.js'

export const TILE_PX = 256
export const TILE_ORIGIN_KM = 1095.93 // half the side of the square covered by level 0
export const TILE_BASE_URL = 'https://trek.nasa.gov/tiles/Moon/SP'

/** The map plane square we draw (the 3D cap): 80 S to the pole. */
export const MAP_SPAN_KM = 2 * MAP_RADIUS_KM

/**
 * The Moon Trek layers used, with the deepest level that exists on the server and, for a layer that covers only part of the
 * square, the half side of its box (km from the pole). Sources: Moon Trek (https://trek.nasa.gov/moon/), layer names as listed there.
 */
export const TILE_LAYERS = {
  // LRO WAC mosaic, 60 S to the pole: 267 m per pixel at its deepest level (the base of the 3D cap is its level 4).
  wac: { id: 'LRO_WAC_Mosaic_SPole60_100m_v02', maxLevel: 5, boxKm: null },
  // LRO NAC mosaic, 85.5 S to the pole, 1 m per pixel natively, 4.2 m per pixel at its deepest served level.
  nac: { id: 'LRO_NAC_Mosaic_SPole85.5_1mp', maxLevel: 11, boxKm: 136.526 },
  // LROC NAC 10 m per pixel mosaic of the permanently shadowed regions (images inside them, transparent elsewhere).
  psr: { id: 'NAC_POLE_PSR_SOUTH_STRETCH', maxLevel: 8, boxKm: 304.01 },
  // LRO Diviner average rock abundance, colored; no data within about 280 km of the pole (checked on 2026-11-15).
  rock: { id: 'Diviner_avg_RockAbundance_SP', maxLevel: 5, boxKm: 931.05 },
  // LOLA hillshade (one fixed Sun, so no seams, no exposure changes: the clean surface of the 2D map). 30 m per pixel natively, 134 m at
  // its deepest served level; box of 457 km around the pole (checked on 2026-11-15).
  shade30: { id: 'LRO_LOLA_Shade_SPole75_30mp_v04', maxLevel: 6, boxKm: 457.44 },
  // LOLA hillshade at 10 m per pixel natively (33 m at its deepest served level), 75.8 km around the pole. The 5 m one (SPole875_5mp)
  // shows the LOLA ground tracks as scan lines, so it is not used.
  shade10: { id: 'LRO_LOLA_Shade_SPolar875_10m', maxLevel: 8, boxKm: 75.84 },
}

/** Side of a tile of `level` (km). */
export const tileSizeKm = (level) => (2 * TILE_ORIGIN_KM) / 2 ** level

/** Size of a pixel of `level` (m). */
export const pixelSizeM = (level) => (tileSizeKm(level) * 1000) / TILE_PX

/** The level whose pixels are just as fine as `pixelM` (the coarsest that is not coarser), within [minLevel, maxLevel]. */
export function levelForPixelSize(pixelM, minLevel, maxLevel) {
  const level = Math.ceil(Math.log2(pixelSizeM(0) / pixelM))
  return Math.min(Math.max(level, minLevel), maxLevel)
}

/** A window of the map plane: { cx, cy, span } (km): a square of side `span` centered at (cx, cy), x east, y toward longitude 0. */
export const FULL_WINDOW = { cx: 0, cy: 0, span: MAP_SPAN_KM }

/** Does a window meet the box of a layer (a square of half side boxKm around the pole)? Null box: always. */
export function windowMeetsBox(win, boxKm) {
  if (boxKm === null) return true
  const half = win.span / 2
  return win.cx + half > -boxKm && win.cx - half < boxKm && win.cy + half > -boxKm && win.cy - half < boxKm
}

/**
 * The tiles of `level` that cover a window: [{ level, row, col, x0, y0, size }] where (x0, y0) is the top-left corner of the tile in the
 * map plane (km) and size its side (km). Only tiles inside the grid.
 */
export function tilesCovering(win, level) {
  const size = tileSizeKm(level)
  const n = 2 ** level
  const half = win.span / 2
  const col0 = Math.max(0, Math.floor((win.cx - half + TILE_ORIGIN_KM) / size))
  const col1 = Math.min(n - 1, Math.floor((win.cx + half + TILE_ORIGIN_KM) / size))
  const row0 = Math.max(0, Math.floor((TILE_ORIGIN_KM - (win.cy + half)) / size))
  const row1 = Math.min(n - 1, Math.floor((TILE_ORIGIN_KM - (win.cy - half)) / size))
  const tiles = []
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      tiles.push({ level, row, col, x0: -TILE_ORIGIN_KM + col * size, y0: TILE_ORIGIN_KM - row * size, size })
    }
  }
  return tiles
}

/** URL of a tile. */
export const tileUrl = (layer, level, row, col) => `${TILE_BASE_URL}/${layer.id}/1.0.0/default/default028mm/${level}/${row}/${col}.png`

const MAX_ZOOM_STEPS = 7 // the smallest window is the map divided by 2^7 (4.75 km)

/**
 * The window to draw for a camera that looks at (xKm, yKm) of the map plane from `distanceKm`: always one of a few sizes (the map divided
 * by a power of two, so the picture is not redrawn at every move) that covers what the camera sees, centered on a multiple of a quarter
 * of its size and kept inside the map. `fovDeg`: vertical field of view of the camera.
 */
export function windowFor(xKm, yKm, distanceKm, fovDeg = 50) {
  const seen = 1.3 * 2 * distanceKm * Math.tan((fovDeg * Math.PI) / 360) // the ground in view, with margin for an oblique look
  const steps = Math.min(MAX_ZOOM_STEPS, Math.max(0, Math.floor(Math.log2(MAP_SPAN_KM / Math.max(seen, 1e-6)))))
  const span = MAP_SPAN_KM / 2 ** steps
  if (steps === 0) return { ...FULL_WINDOW }
  const snap = span / 4
  const limit = MAP_SPAN_KM / 2 - span / 2
  const clamp = (v) => Math.min(Math.max(Math.round(v / snap) * snap, -limit), limit)
  return { cx: clamp(xKm), cy: clamp(yKm), span }
}

export const sameWindow = (a, b) => a !== null && b !== null && a.cx === b.cx && a.cy === b.cy && a.span === b.span
