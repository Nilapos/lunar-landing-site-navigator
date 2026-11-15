import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FULL_WINDOW,
  MAP_SPAN_KM,
  levelForPixelSize,
  pixelSizeM,
  sameWindow,
  tileSizeKm,
  tileUrl,
  tilesCovering,
  TILE_LAYERS,
  windowFor,
  windowMeetsBox,
} from './tileGrid.js'

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`)

test('tile and pixel sizes by level (level 3 is the 1070 m per pixel of the stitched polar mosaic)', () => {
  close(tileSizeKm(0), 2191.86, 1e-9)
  close(pixelSizeM(3), 1070.244, 1e-3)
  close(pixelSizeM(5), 267.56, 1e-2)
  close(pixelSizeM(11), 4.18, 1e-2)
})

test('the level whose pixels are as fine as asked, within the levels a layer has', () => {
  assert.equal(levelForPixelSize(297, 3, TILE_LAYERS.wac.maxLevel), 5) // the whole cap on a 2048 px picture
  assert.equal(levelForPixelSize(74, 6, TILE_LAYERS.nac.maxLevel), 7) // 66.9 m per pixel is finer than 74 m, level 6 (134 m) is not
  assert.equal(levelForPixelSize(1, 6, TILE_LAYERS.nac.maxLevel), 11) // finer than the layer holds: its deepest level
  assert.equal(levelForPixelSize(100000, 3, 5), 3) // coarser than the shallowest level wanted
})

test('the LOLA hillshade layers of the relief surface cover the whole cap and stop at their deepest served level', () => {
  assert.ok(TILE_LAYERS.shade30.boxKm > MAP_SPAN_KM / 2) // the 30 m hillshade reaches past the edge of the map (80 S)
  assert.equal(levelForPixelSize(1, 3, TILE_LAYERS.shade30.maxLevel), 6)
  assert.equal(levelForPixelSize(1, 7, TILE_LAYERS.shade10.maxLevel), 8)
})

test('the tiles that cover the whole cap at level 5: the tile at the corner of the pole is row 16, column 16', () => {
  const tiles = tilesCovering(FULL_WINDOW, 5)
  const pole = tiles.find((t) => t.row === 16 && t.col === 16)
  assert.ok(pole)
  close(pole.x0, 0, 1e-9)
  close(pole.y0, 0, 1e-9)
  close(pole.size, 68.496, 1e-3)
  // Every tile meets the window, and together they cover it.
  const half = MAP_SPAN_KM / 2
  for (const t of tiles) assert.ok(t.x0 + t.size > -half && t.x0 < half && t.y0 > -half && t.y0 - t.size < half)
  const xs = tiles.map((t) => t.x0)
  const ys = tiles.map((t) => t.y0)
  assert.ok(Math.min(...xs) <= -half && Math.max(...xs) + tiles[0].size >= half)
  assert.ok(Math.max(...ys) >= half && Math.min(...ys) - tiles[0].size <= -half)
})

test('a window of 2048 pixels needs about 8 x 8 tiles at the level whose pixels match it, and none outside the grid', () => {
  const win = { cx: 10, cy: -20, span: 8 }
  const tiles = tilesCovering(win, 11)
  assert.ok(tiles.length >= 64 && tiles.length <= 81, `${tiles.length} tiles`) // 8 km of 1.07 km tiles: 8 or 9 per side
  for (const t of tiles) assert.ok(t.row >= 0 && t.row < 2 ** 11 && t.col >= 0 && t.col < 2 ** 11)
  // A window far outside the square gets nothing.
  assert.equal(tilesCovering({ cx: 5000, cy: 0, span: 10 }, 5).length, 0)
})

test('tile URL', () => {
  assert.equal(
    tileUrl(TILE_LAYERS.nac, 9, 252, 257),
    'https://trek.nasa.gov/tiles/Moon/SP/LRO_NAC_Mosaic_SPole85.5_1mp/1.0.0/default/default028mm/9/252/257.png',
  )
})

test('a window meets the box of a layer that covers only part of the square', () => {
  assert.equal(windowMeetsBox(FULL_WINDOW, 136.5), true)
  assert.equal(windowMeetsBox({ cx: 250, cy: 0, span: 20 }, 136.5), false)
  assert.equal(windowMeetsBox({ cx: 130, cy: 0, span: 20 }, 136.5), true)
  assert.equal(windowMeetsBox({ cx: 5000, cy: 0, span: 20 }, null), true)
})

test('the window follows the camera: the whole cap from far away, a quarter-snapped smaller one close up', () => {
  assert.deepEqual(windowFor(0, 0, 820), FULL_WINDOW) // the top camera
  assert.deepEqual(windowFor(100, 100, 5600), FULL_WINDOW) // the globe
  const near = windowFor(12.3, -40.1, 26) // zoom to a site: 26 km away
  assert.ok(near.span < MAP_SPAN_KM / 8 && near.span > 20, `span ${near.span}`)
  close(near.cx / (near.span / 4), Math.round(near.cx / (near.span / 4)), 1e-9) // on a multiple of a quarter of its size
  // The same view moved a little gives the same window: no redraw.
  assert.ok(sameWindow(near, windowFor(12.9, -39.6, 26.5)))
  // It never leaves the map.
  const edge = windowFor(300, 300, 26)
  assert.ok(Math.abs(edge.cx) + edge.span / 2 <= MAP_SPAN_KM / 2 + 1e-9)
  assert.ok(Math.abs(edge.cy) + edge.span / 2 <= MAP_SPAN_KM / 2 + 1e-9)
  // The smallest window is a 128th of the map.
  assert.ok(windowFor(0, 0, 0.5).span >= MAP_SPAN_KM / 128 - 1e-9)
})
