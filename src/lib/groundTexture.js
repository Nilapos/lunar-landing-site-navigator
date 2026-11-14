// The ground texture shared by the 3D views (Terrain and Polar sky): the hillshade picture, then the layers
// (sunlight and shadows, Earth visibility, forbidden zones), painted on a canvas that covers the whole map.
import { visibilityOverlay } from './illumination.js'
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
 *   layers: { sun, earth, slope }; requirements: { maxSlopeDeg, minSunDeg, minEarthDeg }.
 */
export function paintGround(canvas, { hillshade, terrain, frames, sample, layers, requirements }) {
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
}
