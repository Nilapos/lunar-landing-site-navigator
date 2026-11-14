// Any point of the map as a "site": click anywhere on the ground and analyze that place over the whole period, like the named
// sites. The sites come with a 360-value horizon profile (80 m map) and slope statistics around them; for a clicked point we
// take them from the grid cell under it: the 500 m cell when its chunk is loaded (fineGrid.js), else the 2.4 km cell. The
// result is flagged as approximate, because a cell smooths the terrain (a summit or a crater rim inside it is averaged).
import { horizonAtCell } from './horizonGrid.js'
import { MAP_RADIUS_KM, polarRadiusKm } from './polarMap.js'
import { SLOPE_BINS } from './terrain.js'

const DEG = Math.PI / 180

/** Position of a point of the Moon in the map plane (km from the pole): x east, y toward lon 0. */
function mapPlane(latDeg, lonDeg) {
  const rho = polarRadiusKm(latDeg)
  return { x: rho * Math.sin(lonDeg * DEG), y: rho * Math.cos(lonDeg * DEG) }
}

/** The cell under a point: { grid, cell, i, j, source } in the loaded 500 m chunks, else in the 2.4 km terrain; or null. */
function cellUnder(latDeg, lonDeg, terrain, fineChunks) {
  const { x, y } = mapPlane(latDeg, lonDeg)
  for (const chunk of fineChunks) {
    const i = Math.floor(((x - chunk.centerXKm) / chunk.sizeKm + 0.5) * chunk.cells)
    const j = Math.floor((0.5 - (y - chunk.centerYKm) / chunk.sizeKm) * chunk.cells)
    if (i >= 0 && j >= 0 && i < chunk.cells && j < chunk.cells) return { grid: chunk, cell: j * chunk.cells + i, i, j, n: chunk.cells, source: `${chunk.cellM} m` }
  }
  const N = terrain.grid
  const width = 2 * MAP_RADIUS_KM
  const i = Math.floor((x / width + 0.5) * N)
  const j = Math.floor((0.5 - y / width) * N)
  if (i < 0 || j < 0 || i >= N || j >= N) return null
  return { grid: terrain, cell: j * N + i, i, j, n: N, source: '2.4 km' }
}

/**
 * The point (lat, lon in degrees) as a site that useScenario and the views understand, or null outside the data.
 *   terrain: loadTerrain3d (2.4 km grid);  fineChunks: the loaded 500 m chunks (may be empty).
 * Returns { id, custom: true, name, shortName, lat, lon, profile (360 deg values), terrainStats, note, sources }.
 */
export function pointSite(latDeg, lonDeg, { terrain, fineChunks = [] }) {
  const lat = Math.round(latDeg * 1000) / 1000
  const lon = Math.round((((lonDeg % 360) + 360) % 360) * 1000) / 1000
  const found = cellUnder(lat, lon, terrain, fineChunks)
  if (!found) return null
  const { grid, cell, i, j, n, source } = found
  if (grid.horizon[cell * 72] === 0) return null // outside the covered disc: no horizon data

  const profile = Array.from({ length: 360 }, (_, az) => horizonAtCell(grid.horizon, cell, az))
  // Slope statistics from the 3 x 3 cells around: the cell's own value, the mean and a 1-degree histogram.
  const histogram = new Array(SLOPE_BINS).fill(0)
  let sum = 0
  let count = 0
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const ii = i + di
      const jj = j + dj
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue
      const s = grid.slope[jj * n + ii]
      sum += s
      count++
      histogram[Math.min(s, SLOPE_BINS - 1)]++
    }
  }
  const slopeDeg = grid.slope[cell]
  const label = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${lon.toFixed(1)}°E`
  return {
    id: `point-${lat.toFixed(3)}_${lon.toFixed(3)}`,
    custom: true,
    group: 'point',
    name: `Selected point ${label}`,
    shortName: label,
    lat,
    lon,
    profile,
    terrainStats: {
      elevationM: grid.heights[cell],
      slopeMeanDeg: Math.round((sum / count) * 100) / 100,
      slopeMaxDeg: slopeDeg,
      histogram500: histogram,
    },
    gridSource: source,
    note: `A point you selected on the map. Approximate: terrain horizon and slope come from the ${source} grid cell under it, which smooths summits and crater rims. For a decision, analyze a named site (80 m map).`,
    sources: [
      {
        label: 'LOLA LDEM_80S (NASA PDS), gridded',
        url: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl',
      },
    ],
  }
}
