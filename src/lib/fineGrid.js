// The 500 m grid under the 2.4 km overview (see scripts/build-fine-grid.mjs): chunks of 32 x 32 cells (16 km) south of 83 S,
// loaded on demand when the camera comes close. A chunk is a "zone" in the sense of zones.js (center, size and cells in the
// map plane), so zoneFrames, zoneRect and the layer functions work on it as they do on the fine zones of the sites.
import { AZIMUTHS } from './horizonGrid.js'
import { zoneFrames } from './zones.js'

/** Loads the description of the grid. Returns null when there is none (the app then stays on the 2.4 km overview). */
export async function loadFineIndex(baseUrl = '/') {
  try {
    const response = await fetch(`${baseUrl}grid500/index.json`)
    if (!response.ok) return null
    const index = await response.json()
    return index && Array.isArray(index.chunks) ? index : null
  } catch {
    return null
  }
}

/** The chunk (row J from the top, column I from the left) as a zone description: center and size in km from the pole. */
export function chunkAsZone(index, J, I) {
  const size = index.chunkCells * (index.cellM / 1000)
  return {
    id: `${J}-${I}`,
    centerXKm: ((I + 0.5) / index.chunksPerSide - 0.5) * index.spanKm,
    centerYKm: (0.5 - (J + 0.5) / index.chunksPerSide) * index.spanKm,
    sizeKm: size,
    cells: index.chunkCells,
    cellM: index.cellM,
  }
}

/** Splits an unzipped chunk into its tables and undoes the delta coding of the horizon. */
export function decodeChunk(index, J, I, buffer) {
  const zone = chunkAsZone(index, J, I)
  const n = zone.cells * zone.cells
  const expected = index.horizonOffset + n * AZIMUTHS
  if (buffer.byteLength !== expected) throw new Error(`Chunk ${zone.id}: ${buffer.byteLength} bytes, expected ${expected}`)
  const heights = new Int16Array(buffer.slice(0, n * 2))
  const slope = new Uint8Array(buffer, index.slopeOffset, n)
  const horizon = new Uint8Array(buffer.slice(index.horizonOffset, expected))
  for (let c = 0; c < n; c++) {
    let value = 0
    for (let a = 0; a < AZIMUTHS; a++) {
      value = (value + horizon[c * AZIMUTHS + a]) & 255
      horizon[c * AZIMUTHS + a] = value
    }
  }
  // `grid`, `slope` and `horizon` make a chunk usable wherever the 2.4 km terrain is (illumination.js).
  const chunk = { ...zone, grid: zone.cells, heights, slope, horizon }
  chunk.frames = zoneFrames(chunk)
  return chunk
}

/** Unzips a gzip file; a buffer that is not gzip (a server may have unzipped it already) is returned as it is. */
export async function gunzip(buffer) {
  const bytes = new Uint8Array(buffer)
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) return buffer
  const stream = new Response(buffer).body.pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

export async function loadFineChunk(index, J, I, baseUrl = '/') {
  const response = await fetch(`${baseUrl}grid500/${J}-${I}.bin.gz`)
  if (!response.ok) throw new Error(`Chunk ${J}-${I} not found`)
  return decodeChunk(index, J, I, await gunzip(await response.arrayBuffer()))
}

/** The `max` chunks closest to a point of the map plane (km from the pole), nearest first: [[J, I], ...]. */
export function chunksNear(index, xKm, yKm, max = 80) {
  const size = index.chunkCells * (index.cellM / 1000)
  return index.chunks
    .map(([J, I]) => {
      const z = chunkAsZone(index, J, I)
      return { J, I, d: Math.hypot(z.centerXKm - xKm, z.centerYKm - yKm) }
    })
    .filter((c) => c.d < size * 40)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map(({ J, I }) => [J, I])
}
