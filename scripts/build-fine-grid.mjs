// The 500 m grid under the 2.4 km overview: height, slope and terrain horizon of every cell south of 83 S, in chunks of
// 32 x 32 cells (16 km) that the app loads on demand when the camera comes close.
//
// Usage: node scripts/build-fine-grid.mjs "<path to ldem_80s_*.img>" [--cell 500] [--chunk 32] [--south 83]
//   The map can be any LDEM_80S product (80, 40 or 20 m per pixel, see createDemAuto).
// Output in public/grid500/ (the folder name stays "grid500" whatever the cell size):
//   index.json        description and the list of chunks [row, column]
//   <row>-<col>.bin.gz  one chunk, gzip of: heights (Int16, m above the 1737.4 km sphere, cell mean) | slope (Uint8, deg,
//                     90th percentile of the map-resolution slopes in the cell) | horizon (Uint8 x 72 azimuths per cell,
//                     each byte stored as the difference with the previous azimuth, see src/lib/fineGrid.js)
// The grid is aligned with the map plane (x east, y toward lon 0, km from the pole), rows top first, like the 2.4 km grid.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { endianness } from 'node:os'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { AZIMUTHS, computeHorizonFast, encodeHorizon } from '../src/lib/horizonGrid.js'
import { MOON_RADIUS_M, createDemAuto, slopeAtPixel } from '../src/lib/terrain.js'

const args = process.argv.slice(2)
const demPath = args.find((a) => !a.startsWith('--') && /[\\/.]/.test(a))
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : fallback
}
const cellM = option('cell', 500)
const chunkCells = option('chunk', 32)
const southLat = option('south', 83)
if (!demPath) {
  console.error('Usage: node scripts/build-fine-grid.mjs <path to ldem_80s_*.img> [--cell 500] [--chunk 32] [--south 83]')
  process.exit(1)
}
if (endianness() !== 'LE') throw new Error('This script assumes a little-endian machine')

const buf = readFileSync(demPath)
const dem = createDemAuto(new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2))
const RAD = Math.PI / 180
const cellKm = cellM / 1000
const rMaxKm = (2 * MOON_RADIUS_M * Math.tan(((90 - southLat) * RAD) / 2)) / 1000 // radius of the covered disc in the map plane
const chunksPerSide = Math.ceil((2 * rMaxKm) / (cellKm * chunkCells))
const n = chunksPerSide * chunkCells // cells per side
const spanKm = n * cellKm
const pxPerCell = cellM / dem.scaleM
const outDir = fileURLToPath(new URL('../public/grid500/', import.meta.url))
mkdirSync(outDir, { recursive: true })
console.log(`Map: ${dem.size} px, ${dem.scaleM} m per pixel. Grid: ${n} x ${n} cells of ${cellM} m (${chunksPerSide} x ${chunksPerSide} chunks), disc of ${rMaxKm.toFixed(0)} km.`)

const centerXY = (I, J, i, j) => ({
  x: ((I * chunkCells + i + 0.5) / n - 0.5) * spanKm, // km east of the pole
  y: (0.5 - (J * chunkCells + j + 0.5) / n) * spanKm, // km toward lon 0
})

const chunks = []
const started = Date.now()
let doneCells = 0
for (let J = 0; J < chunksPerSide; J++) {
  for (let I = 0; I < chunksPerSide; I++) {
    // Keep the chunk if any of its cells is inside the covered disc.
    let inside = false
    for (let j = 0; j < chunkCells && !inside; j += chunkCells - 1) for (let i = 0; i < chunkCells && !inside; i += chunkCells - 1) {
      const { x, y } = centerXY(I, J, i, j)
      if (Math.hypot(x, y) <= rMaxKm + cellKm * chunkCells * 0.75) inside = true
    }
    if (!inside) continue

    const cells = chunkCells * chunkCells
    const heights = new Int16Array(cells)
    const slope = new Uint8Array(cells)
    const horizon = new Uint8Array(cells * AZIMUTHS)
    for (let j = 0; j < chunkCells; j++) {
      for (let i = 0; i < chunkCells; i++) {
        const k = j * chunkCells + i
        const { x, y } = centerXY(I, J, i, j)
        // Footprint of the cell in map pixels: mean height and 90th percentile of the slopes.
        const c = dem.center + (x * 1000) / dem.scaleM
        const r = dem.center - (y * 1000) / dem.scaleM
        const c0 = Math.round(c - pxPerCell / 2 + 0.5)
        const c1 = Math.max(c0, Math.round(c + pxPerCell / 2 - 0.5))
        const r0 = Math.round(r - pxPerCell / 2 + 0.5)
        const r1 = Math.max(r0, Math.round(r + pxPerCell / 2 - 0.5))
        let sum = 0
        let count = 0
        const slopes = []
        for (let rr = r0; rr <= r1; rr++) {
          for (let cc = c0; cc <= c1; cc++) {
            if (cc < 0 || rr < 0 || cc >= dem.size || rr >= dem.size) continue
            sum += dem.data[rr * dem.size + cc] * dem.heightFactor
            count++
            const s = slopeAtPixel(dem, cc, rr)
            if (!Number.isNaN(s)) slopes.push(s)
          }
        }
        if (count === 0) continue // outside the map: left at 0 (no horizon data)
        heights[k] = Math.round(sum / count)
        slopes.sort((a, b) => a - b)
        slope[k] = Math.min(255, Math.round(slopes[Math.min(slopes.length - 1, Math.floor(slopes.length * 0.9))] ?? 0))
        const rho = Math.hypot(x, y) * 1000
        const lon = ((Math.atan2(x, y) / RAD) + 360) % 360
        const lat = -90 + (2 * Math.atan(rho / (2 * MOON_RADIUS_M))) / RAD
        const h = computeHorizonFast(dem, lat, lon, heights[k])
        // Stored as the difference with the previous azimuth: the horizon is smooth, so this compresses much better.
        let previous = 0
        for (let a = 0; a < AZIMUTHS; a++) {
          const value = encodeHorizon(h[a])
          horizon[k * AZIMUTHS + a] = (value - previous) & 255
          previous = value
        }
      }
    }
    const raw = Buffer.concat([Buffer.from(heights.buffer), Buffer.from(slope), Buffer.from(horizon)])
    writeFileSync(`${outDir}${J}-${I}.bin.gz`, gzipSync(raw, { level: 9 }))
    chunks.push([J, I])
    doneCells += cells
    if (chunks.length % 40 === 0) console.log(`${chunks.length} chunks (${((Date.now() - started) / 1000).toFixed(0)} s)`)
  }
}

const index = {
  cellM,
  chunkCells,
  chunksPerSide,
  cells: n,
  spanKm,
  southLatDeg: -southLat,
  azimuths: AZIMUTHS,
  demScaleM: dem.scaleM,
  slopeOffset: chunkCells * chunkCells * 2,
  horizonOffset: chunkCells * chunkCells * 3,
  chunks,
  note: 'LOLA LDEM_80S (NASA PDS). Heights: cell mean in m above the 1737.4 km sphere. Slope: 90th percentile of the map-resolution slopes per cell, degrees. Horizon: 72 azimuths, delta-coded.',
}
writeFileSync(`${outDir}index.json`, JSON.stringify(index) + '\n')
console.log(`Wrote ${chunks.length} chunks (${doneCells} cells) to ${outDir} in ${((Date.now() - started) / 1000).toFixed(0)} s`)
