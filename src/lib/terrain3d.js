// Data and helpers for the 3D view (no 3D library here, so they can be tested).
// The files come from scripts/build-3d-data.mjs: a GRID x GRID cell grid of the south polar map.

/** Loads the 3D description and its binary files: { grid, radiusKm, cellKm, heights (Int16, m), slope (Uint8, deg) }. */
export async function loadTerrain3d(baseUrl = '/') {
  const meta = await (await fetch(`${baseUrl}south-pole-3d.json`)).json()
  const [heightsBuf, slopeBuf] = await Promise.all([
    fetch(`${baseUrl}${meta.heightsFile}`).then((r) => r.arrayBuffer()),
    fetch(`${baseUrl}${meta.slopeFile}`).then((r) => r.arrayBuffer()),
  ])
  const heights = new Int16Array(heightsBuf)
  const slope = new Uint8Array(slopeBuf)
  if (heights.length !== meta.grid ** 2 || slope.length !== meta.grid ** 2) throw new Error('3D data files do not match their description')
  return { ...meta, heights, slope }
}

/** Height (m) at a position given as fractions of the map (0..1), bilinear between cell centers. */
export function sampleHeight(terrain, fx, fy) {
  const { grid, heights } = terrain
  const gx = Math.min(Math.max(fx * grid - 0.5, 0), grid - 1)
  const gy = Math.min(Math.max(fy * grid - 0.5, 0), grid - 1)
  const x0 = Math.min(Math.floor(gx), grid - 2)
  const y0 = Math.min(Math.floor(gy), grid - 2)
  const tx = gx - x0
  const ty = gy - y0
  const h = (x, y) => heights[y * grid + x]
  const top = h(x0, y0) * (1 - tx) + h(x0 + 1, y0) * tx
  const bottom = h(x0, y0 + 1) * (1 - tx) + h(x0 + 1, y0 + 1) * tx
  return top * (1 - ty) + bottom * ty
}

/**
 * Forbidden-zone layer: RGBA pixels (grid x grid) in red where the 90th percentile slope of a cell is above
 * the rover's limit; more opaque the steeper it is. Cells under the limit stay transparent.
 */
export function slopeOverlayRgba(terrain, limitDeg) {
  const { grid, slope } = terrain
  const rgba = new Uint8ClampedArray(grid * grid * 4)
  for (let i = 0; i < grid * grid; i++) {
    const over = slope[i] - limitDeg
    if (over <= 0) continue
    rgba[i * 4] = 255
    rgba[i * 4 + 1] = 40
    rgba[i * 4 + 2] = 40
    rgba[i * 4 + 3] = Math.round(255 * Math.min(0.35 + 0.05 * over, 0.8))
  }
  return rgba
}
