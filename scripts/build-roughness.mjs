// Surface roughness of the south polar region, from the LOLA 20 m elevation map: for every cell of the map plane (500 m by default), the
// RMS deviation (meters) of the 20 m pixels from the mean of the 5 x 5 pixels around them (100 m): the height variation at the scale of
// a lander and a rover (boulder fields, small craters, hummocks), with the regional slope and the big craters taken out (those are the
// slope layer's job). About 0.4 m is a smooth plain, 1.3 m (the 90th percentile of the region) a broken ground, 2.5 m (99th) a very rough one.
// This is our own metric computed from NASA's LOLA map; it is NOT NASA's roughness product (LRO_LOLA_ClrRoughness, 240 m per pixel and only
// served down to about 1 km per pixel on Moon Trek). It inherits the noise of the 20 m LOLA grid, which is interpolated between the laser tracks.
//
// Usage: node scripts/build-roughness.mjs "<path to ldem_80s_*.img>" [--cell 500]
// Output: public/south-pole-roughness.bin = header (4 x Uint16 little-endian: cells per side n, cell size in meters, counts per meter,
//   pixels per cell used) then n x n Uint8, row 0 on top (y toward longitude 0), column 0 on the west (x east), the same plane as
//   src/lib/polarMap.js. Value = round(rms_m * counts_per_meter), 255 = that or more; 0 outside the 80 S disc or without data.
// Built ONCE from the 20 m map and committed (about 1.5 MB): do not regenerate and commit it again without a strong reason.
import { writeFileSync, readFileSync } from 'node:fs'
import { endianness } from 'node:os'
import { fileURLToPath } from 'node:url'
import { MAP_RADIUS_KM } from '../src/lib/polarMap.js'
import { createDemAuto } from '../src/lib/terrain.js'

const args = process.argv.slice(2)
const demPath = args.find((a) => !a.startsWith('--') && /[\\/.]/.test(a))
const cellM = args.includes('--cell') ? Number(args[args.indexOf('--cell') + 1]) : 500
const COUNTS_PER_M = 100 // 0.01 m steps, 255 = 2.55 m or more
const HALF = 2 // the local mean is taken over (2 x HALF + 1)^2 pixels: 5 x 5 = 100 m at 20 m per pixel
if (!demPath) {
  console.error('Usage: node scripts/build-roughness.mjs <path to ldem_80s_*.img> [--cell 500]')
  process.exit(1)
}
if (endianness() !== 'LE') throw new Error('This script assumes a little-endian machine')

const buf = readFileSync(demPath)
const dem = createDemAuto(new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2))
const spanKm = 2 * MAP_RADIUS_KM
const n = Math.round((spanKm * 1000) / cellM)
const px = Math.max(2 * HALF + 2, Math.round(cellM / dem.scaleM)) // pixels per cell side
console.log(`Map: ${dem.size} px, ${dem.scaleM} m per pixel. Grid: ${n} x ${n} cells of ${cellM} m, ${px} x ${px} pixels each.`)

const W = px + 1
const integral = new Float64Array(W * W) // summed-area table of the cell's heights, to get the 5 x 5 means in a few operations
const out = new Uint8Array(8 + n * n)
new Uint16Array(out.buffer, 0, 4).set([n, cellM, COUNTS_PER_M, px])
const hist = new Uint32Array(256)
const started = Date.now()
const box = (2 * HALF + 1) ** 2
for (let j = 0; j < n; j++) {
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n - 0.5) * spanKm // km east of the pole
    const y = (0.5 - (j + 0.5) / n) * spanKm // km toward lon 0
    if (Math.hypot(x, y) > MAP_RADIUS_KM - cellM / 1000) continue // keep the cell whole inside the map
    const c0 = Math.round(dem.center + (x * 1000) / dem.scaleM - px / 2)
    const r0 = Math.round(dem.center - (y * 1000) / dem.scaleM - px / 2)
    if (c0 < 0 || r0 < 0 || c0 + px > dem.size || r0 + px > dem.size) continue
    for (let r = 0; r < px; r++) {
      const row = (r0 + r) * dem.size + c0
      let acc = 0
      for (let c = 0; c < px; c++) {
        acc += dem.data[row + c] * dem.heightFactor
        integral[(r + 1) * W + c + 1] = integral[r * W + c + 1] + acc
      }
    }
    let sum = 0
    let count = 0
    for (let r = HALF; r < px - HALF; r++) {
      const row = (r0 + r) * dem.size + c0
      for (let c = HALF; c < px - HALF; c++) {
        const mean =
          (integral[(r + HALF + 1) * W + c + HALF + 1] - integral[(r - HALF) * W + c + HALF + 1] - integral[(r + HALF + 1) * W + c - HALF] + integral[(r - HALF) * W + c - HALF]) / box
        const d = dem.data[row + c] * dem.heightFactor - mean
        sum += d * d
        count++
      }
    }
    const value = Math.min(255, Math.round(Math.sqrt(sum / count) * COUNTS_PER_M))
    out[8 + j * n + i] = value
    hist[value]++
  }
  if (j % 200 === 0) console.log(`row ${j} / ${n}, ${((Date.now() - started) / 1000).toFixed(0)} s`)
}
const outPath = fileURLToPath(new URL('../public/south-pole-roughness.bin', import.meta.url))
writeFileSync(outPath, out)
const total = hist.reduce((s, v) => s + v, 0)
const pct = (p) => {
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= total * p) return v / COUNTS_PER_M
  }
  return 255 / COUNTS_PER_M
}
console.log(
  `Wrote ${outPath} (${(out.length / 1e6).toFixed(2)} MB). RMS deviation, meters: 10th ${pct(0.1)}, median ${pct(0.5)}, 75th ${pct(0.75)}, 90th ${pct(0.9)}, 95th ${pct(0.95)}, 99th ${pct(0.99)}, saturated (>= 2.55 m) ${hist[255]} cells.`,
)
