// The ground texture shared by the 3D views (Terrain and Polar sky): the hillshade picture, then the layers
// (sunlight and shadows, Earth visibility, forbidden zones), painted on a canvas that covers the whole map.
import { visibilityOverlay } from './illumination.js'
import { GRID_LATS, GRID_LONS, circleRadius, projectToMap, regionSquare } from './polarMap.js'
import { slopeOverlayRgba } from './terrain3d.js'

export const TEXTURE_SIZE = 1024

// Draws a grid-sized RGBA layer onto the texture, only inside the 80 S disc (the corners hold no data).
function drawLayer(ctx, rgba, grid) {
  const small = document.createElement('canvas')
  small.width = grid
  small.height = grid
  small.getContext('2d').putImageData(new ImageData(rgba, grid, grid), 0, 0)
  ctx.save()
  ctx.beginPath()
  ctx.arc(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2 - 2, 0, Math.PI * 2)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(small, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  ctx.restore()
}

/**
 * Repaints `canvas` (TEXTURE_SIZE square).
 *   hillshade: the relief picture; terrain, frames: see loadTerrain3d and buildCellFrames;
 *   sample: one entry of /api/sky (or null: no sunlight / Earth layer);
 *   layers: { sun, earth, slope }; requirements: { maxSlopeDeg, minSunDeg, minEarthDeg };
 *   overlay (optional): { regions: [{ lat, lon }], colors: { grid, regionFill, regionEdge } }, the graticule and the
 *   candidate region squares in the style of NASA's Artemis III videos, drawn over the layers.
 */
export function paintGround(canvas, { hillshade, terrain, frames, sample, layers, requirements, overlay }) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  ctx.drawImage(hillshade, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  if ((layers.sun || layers.earth) && sample && frames) {
    const rgba = visibilityOverlay(terrain, frames, sample, {
      sun: layers.sun,
      earth: layers.earth,
      minSunDeg: requirements.minSunDeg,
      minEarthDeg: requirements.minEarthDeg,
    })
    drawLayer(ctx, rgba, terrain.grid)
  }
  if (layers.slope) drawLayer(ctx, slopeOverlayRgba(terrain, requirements.maxSlopeDeg), terrain.grid)
  if (overlay) drawOverlay(ctx, overlay)
}

// Graticule (thin lines) then one translucent square with a bright edge per candidate region.
function drawOverlay(ctx, { regions, colors }) {
  const S = TEXTURE_SIZE
  ctx.save()
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 3 // the texture is seen reduced: thinner lines vanish
  ctx.beginPath()
  for (const lat of GRID_LATS) {
    ctx.moveTo(S / 2 + circleRadius(lat) * S, S / 2)
    ctx.arc(S / 2, S / 2, circleRadius(lat) * S, 0, Math.PI * 2)
  }
  for (const lon of GRID_LONS) {
    const edge = projectToMap(-80, lon)
    ctx.moveTo(S / 2, S / 2)
    ctx.lineTo(edge.x * S, edge.y * S)
  }
  ctx.stroke()
  ctx.fillStyle = colors.regionFill
  ctx.strokeStyle = colors.regionEdge
  ctx.lineWidth = 3
  for (const r of regions) {
    const sq = regionSquare(r.lat, r.lon)
    ctx.fillRect(sq.x * S, sq.y * S, sq.side * S, sq.side * S)
    ctx.strokeRect(sq.x * S, sq.y * S, sq.side * S, sq.side * S)
  }
  ctx.restore()
}
