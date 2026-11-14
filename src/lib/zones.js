// Fine zones around the analyzable sites (see scripts/build-zones.mjs): a square of about 16 km cut into 100 to 250 m cells,
// each with its height, slope and terrain horizon. They sit on top of the 2.4 km overview grid when the camera comes close.
//
// A zone is described by its json file and its binary file. Like the 2.4 km grid, cells are listed row by row, top row
// first (toward lon 0), and the map plane has x to the east and y toward lon 0, in km from the south pole.
import { MAP_RADIUS_KM, polarRadiusKm } from './polarMap.js'
import { MOON_RADIUS_KM } from './polarSky.js'
import { localFrame, unitVector } from './sky.js'

const DEG = 180 / Math.PI

/** Splits the binary file of a zone into its three tables. `meta` is the json description. */
export function parseZone(meta, buffer) {
  const n = meta.cells * meta.cells
  const heights = new Int16Array(buffer.slice(0, n * 2))
  const slope = new Uint8Array(buffer, meta.slopeOffset, n)
  const horizon = new Uint8Array(buffer, meta.horizonOffset, n * meta.azimuths)
  if (buffer.byteLength !== meta.horizonOffset + n * meta.azimuths) throw new Error(`Zone ${meta.id}: file does not match its description`)
  // `grid`, `slope` and `horizon` make a zone usable wherever the 2.4 km terrain is (illumination.js).
  return { ...meta, grid: meta.cells, heights, slope, horizon }
}

/** Loads a zone from the public folder. Rejects when there is no zone for that site. */
export async function loadZone(id, baseUrl = '/') {
  const metaResponse = await fetch(`${baseUrl}zones/${id}.json`)
  if (!metaResponse.ok) throw new Error(`No fine zone for ${id}`)
  const meta = await metaResponse.json()
  const bin = await fetch(`${baseUrl}zones/${id}.bin`)
  if (!bin.ok) throw new Error(`No fine zone for ${id}`)
  return parseZone(meta, await bin.arrayBuffer())
}

/** Center of a cell on the map plane (km from the pole). */
function cellXY(zone, i, j) {
  return {
    x: zone.centerXKm + ((i + 0.5) / zone.cells - 0.5) * zone.sizeKm,
    y: zone.centerYKm - ((j + 0.5) / zone.cells - 0.5) * zone.sizeKm,
  }
}

/** Latitude and east longitude (deg) of the center of cell (i, j): same projection as the 2.4 km grid. */
export function zoneCellLatLon(zone, i, j) {
  const { x, y } = cellXY(zone, i, j)
  const rho = Math.hypot(x, y)
  return { lat: -90 + 2 * Math.atan(rho / (2 * MOON_RADIUS_KM)) * DEG, lon: (Math.atan2(x, y) * DEG + 360) % 360 }
}

/** Local frames (up, east, north) of every cell, as buildCellFrames does for the 2.4 km grid. All cells are valid. */
export function zoneFrames(zone) {
  const n = zone.cells
  const up = new Float32Array(n * n * 3)
  const east = new Float32Array(n * n * 3)
  const north = new Float32Array(n * n * 3)
  const valid = new Uint8Array(n * n).fill(1)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = j * n + i
      const { lat, lon } = zoneCellLatLon(zone, i, j)
      const f = localFrame(lat, lon)
      up.set(f.up, c * 3)
      east.set(f.east, c * 3)
      north.set(f.north, c * 3)
    }
  }
  return { up, east, north, valid }
}

/** Vertices (km) of the zone's relief, one per cell center, on the sphere plus the height times `exaggeration`. */
export function zonePositions(zone, exaggeration, out = new Float32Array(zone.cells ** 2 * 3)) {
  const n = zone.cells
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const c = j * n + i
      const { lat, lon } = zoneCellLatLon(zone, i, j)
      const u = unitVector(lat, lon)
      const r = MOON_RADIUS_KM + (zone.heights[c] / 1000) * exaggeration
      out[c * 3] = u[0] * r
      out[c * 3 + 1] = u[1] * r
      out[c * 3 + 2] = u[2] * r
    }
  }
  return out
}

/** Triangles of the zone (two per square of four neighbor cells). */
export function zoneIndices(cells) {
  const out = new Uint32Array((cells - 1) * (cells - 1) * 6)
  let k = 0
  for (let j = 0; j < cells - 1; j++) {
    for (let i = 0; i < cells - 1; i++) {
      const a = j * cells + i
      const b = a + 1
      const c = a + cells
      const d = c + 1
      out.set([a, c, b, b, c, d], k)
      k += 6
    }
  }
  return out
}

/** The zone as a square of the 2.4 km map, in fractions of the map width: { x, y, side } (top-left corner and side). */
export function zoneRect(zone) {
  const width = 2 * MAP_RADIUS_KM
  const side = zone.sizeKm / width
  return { x: 0.5 + zone.centerXKm / width - side / 2, y: 0.5 - zone.centerYKm / width - side / 2, side }
}

/**
 * The part of the map the zone's relief really covers: its vertices sit at cell centers, so the patch is half a cell
 * smaller on every side than the square. This is the hole to cut in the overview texture.
 */
export function zonePatchRect(zone) {
  const r = zoneRect(zone)
  const half = r.side / zone.cells / 2
  return { x: r.x + half, y: r.y + half, side: r.side - 2 * half }
}

/** Height (m) of the cell under a point of the Moon, or null when the point is outside the zone. */
export function zoneHeightAt(zone, latDeg, lonDeg) {
  const rho = polarRadiusKm(latDeg)
  const lon = (lonDeg * Math.PI) / 180
  const x = rho * Math.sin(lon)
  const y = rho * Math.cos(lon)
  const i = Math.floor(((x - zone.centerXKm) / zone.sizeKm + 0.5) * zone.cells)
  const j = Math.floor((0.5 - (y - zone.centerYKm) / zone.sizeKm) * zone.cells)
  if (i < 0 || j < 0 || i >= zone.cells || j >= zone.cells) return null
  return zone.heights[j * zone.cells + i]
}
