// Builds the data files of the 3D view from the LOLA south polar map.
//
// Usage: node scripts/build-3d-data.mjs "<path to ldem_80s_80m.img>"
// Output (in public/, served as static files):
//   south-pole-heights.bin  Int16 little-endian, GRID x GRID cells, mean height in meters (rows: lon 0 at the top)
//   south-pole-slope.bin    Uint8, GRID x GRID cells, 90th percentile of the 80 m slopes inside each cell (degrees)
//   south-pole-3d.json      description of the files
// Each cell covers (608 km / GRID) of the map, in the same projection and orientation as the hillshade picture.
import { readFileSync, writeFileSync } from 'node:fs'
import { endianness } from 'node:os'
import { fileURLToPath } from 'node:url'
import { MAP_RADIUS_KM } from '../src/lib/polarMap.js'
import { SLOPE_BINS, createDem } from '../src/lib/terrain.js'

const demPath = process.argv[2]
if (!demPath) {
  console.error('Usage: node scripts/build-3d-data.mjs <path to ldem_80s_80m.img>')
  process.exit(1)
}
if (endianness() !== 'LE') throw new Error('This script assumes a little-endian machine')

export const GRID = 256
const buf = readFileSync(demPath)
const dem = createDem(new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2))
const { size, scaleM, heightFactor, data } = dem
const block = size / GRID
const RAD = Math.PI / 180

// Mean height per cell.
const heights = new Int16Array(GRID * GRID)
for (let gy = 0; gy < GRID; gy++) {
  for (let gx = 0; gx < GRID; gx++) {
    const x0 = Math.floor(gx * block)
    const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * block))
    const y0 = Math.floor(gy * block)
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * block))
    let sum = 0
    let n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += data[y * size + x]; n++ }
    heights[gy * GRID + gx] = Math.round((sum / n) * heightFactor)
  }
}

// 90th percentile of the full-resolution slopes inside each cell (histogram of 1-degree bins).
const hist = new Uint32Array(GRID * GRID * SLOPE_BINS)
for (let y = 1; y < size - 1; y++) {
  const gy = Math.min(GRID - 1, Math.floor(y / block))
  for (let x = 1; x < size - 1; x++) {
    const i = y * size + x
    const dzdx = ((data[i - size + 1] + 2 * data[i + 1] + data[i + size + 1]) - (data[i - size - 1] + 2 * data[i - 1] + data[i + size - 1])) * heightFactor / (8 * scaleM)
    const dzdy = ((data[i + size - 1] + 2 * data[i + size] + data[i + size + 1]) - (data[i - size - 1] + 2 * data[i - size] + data[i - size + 1])) * heightFactor / (8 * scaleM)
    const slope = Math.atan(Math.hypot(dzdx, dzdy)) / RAD
    const gx = Math.min(GRID - 1, Math.floor(x / block))
    hist[(gy * GRID + gx) * SLOPE_BINS + Math.min(Math.floor(slope), SLOPE_BINS - 1)]++
  }
}
const slopeP90 = new Uint8Array(GRID * GRID)
for (let c = 0; c < GRID * GRID; c++) {
  let total = 0
  for (let b = 0; b < SLOPE_BINS; b++) total += hist[c * SLOPE_BINS + b]
  let acc = 0
  let bin = 0
  for (; bin < SLOPE_BINS; bin++) {
    acc += hist[c * SLOPE_BINS + bin]
    if (acc >= 0.9 * total) break
  }
  slopeP90[c] = total ? Math.min(bin, 90) : 0
}

const dir = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))
writeFileSync(dir('south-pole-heights.bin'), Buffer.from(heights.buffer))
writeFileSync(dir('south-pole-slope.bin'), Buffer.from(slopeP90.buffer))
const hs = Array.from(heights)
writeFileSync(
  dir('south-pole-3d.json'),
  JSON.stringify(
    {
      grid: GRID,
      radiusKm: MAP_RADIUS_KM,
      cellKm: (2 * MAP_RADIUS_KM) / GRID,
      heightsFile: 'south-pole-heights.bin',
      slopeFile: 'south-pole-slope.bin',
      minHeightM: Math.min(...hs),
      maxHeightM: Math.max(...hs),
      note: 'LOLA LDEM_80S_80M (NASA PDS). Heights: cell mean in m above the 1737.4 km sphere. Slope: 90th percentile of 80 m slopes per cell, degrees.',
    },
    null,
    1,
  ) + '\n',
)
console.log(`Wrote 3D data: ${GRID}x${GRID} cells of ${((2 * MAP_RADIUS_KM) / GRID).toFixed(2)} km; heights ${Math.min(...hs)}..${Math.max(...hs)} m`)
console.log(`Slope p90 range ${Math.min(...slopeP90)}..${Math.max(...slopeP90)} deg`)
