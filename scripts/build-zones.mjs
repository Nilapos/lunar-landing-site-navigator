// Fine grids around each analyzable site: the "zoom" level under the 2.4 km overview grid.
//
// Usage: node scripts/build-zones.mjs "<path to ldem_80s_*.img>" [--cell 125] [--size 16]
//   The map can be any LDEM_80S product (80, 40 or 20 m per pixel, see createDemAuto). With the 20 m map use --cell 125;
//   with the 80 m map use --cell 250 (a cell should span at least 3 map pixels).
// Output, for each site of src/data/south-pole-sites.js, in public/zones/:
//   <id>.json  description (center, size, cells, offsets)
//   <id>.bin   heights (Int16, m above the 1737.4 km sphere, cell mean) | slope (Uint8, deg, 90th percentile of the
//              map-resolution slopes inside the cell) | horizon (Uint8 x 72 azimuths per cell, see src/lib/horizonGrid.js)
//   <id>.png   hillshade of the zone (512 x 512)
// A zone is a square of --size km centered on the site, aligned with the map axes (east right, lon 0 up), cut into
// cells x cells squares. Cells are listed row by row, top row first, like the 3D grid of the whole pole.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { endianness } from 'node:os'
import { fileURLToPath } from 'node:url'
import { southPoleSites } from '../src/data/south-pole-sites.js'
import { AZIMUTHS, computeHorizonFast, encodeHorizon } from '../src/lib/horizonGrid.js'
import { MOON_RADIUS_M, createDemAuto, slopeAtPixel, toPixel } from '../src/lib/terrain.js'
import { encodePng } from './lib/png.mjs'

const args = process.argv.slice(2)
const demPath = args.find((a) => !a.startsWith('--') && /[\\/.]/.test(a))
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : fallback
}
const cellM = option('cell', 125)
const sizeKm = option('size', 16)
if (!demPath) {
  console.error('Usage: node scripts/build-zones.mjs <path to ldem_80s_*.img> [--cell 125] [--size 16]')
  process.exit(1)
}
if (endianness() !== 'LE') throw new Error('This script assumes a little-endian machine')

const buf = readFileSync(demPath)
const dem = createDemAuto(new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2))
const cells = Math.round((sizeKm * 1000) / cellM)
const RAD = Math.PI / 180
const outDir = fileURLToPath(new URL('../public/zones/', import.meta.url))
mkdirSync(outDir, { recursive: true })
console.log(`Map: ${dem.size} px, ${dem.scaleM} m per pixel. Zones: ${sizeKm} km, ${cells} x ${cells} cells of ${cellM} m.`)

const HILLSHADE = 512
const light = [Math.sin(315 * RAD) * Math.cos(25 * RAD), Math.cos(315 * RAD) * Math.cos(25 * RAD), Math.sin(25 * RAD)]

for (const site of southPoleSites) {
  const started = Date.now()
  const [col0, row0] = toPixel(dem, site.lat, site.lon)
  const pxPerCell = cellM / dem.scaleM
  const half = (cells * pxPerCell) / 2
  const colOf = (i) => col0 + ((i + 0.5) / cells) * cells * pxPerCell - half
  const rowOf = (j) => row0 + ((j + 0.5) / cells) * cells * pxPerCell - half
  if (col0 - half < 2 || row0 - half < 2 || col0 + half > dem.size - 3 || row0 + half > dem.size - 3) {
    console.log(`${site.id}: too close to the edge of the map, skipped`)
    continue
  }

  const heights = new Int16Array(cells * cells)
  const slope = new Uint8Array(cells * cells)
  const horizon = new Uint8Array(cells * cells * AZIMUTHS)
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const k = j * cells + i
      const c = colOf(i)
      const r = rowOf(j)
      // Footprint of the cell in map pixels: mean height and 90th percentile of the slopes.
      const c0 = Math.round(c - pxPerCell / 2 + 0.5)
      const c1 = Math.max(c0, Math.round(c + pxPerCell / 2 - 0.5))
      const r0 = Math.round(r - pxPerCell / 2 + 0.5)
      const r1 = Math.max(r0, Math.round(r + pxPerCell / 2 - 0.5))
      let sum = 0
      let n = 0
      const slopes = []
      for (let rr = r0; rr <= r1; rr++) {
        for (let cc = c0; cc <= c1; cc++) {
          sum += dem.data[rr * dem.size + cc] * dem.heightFactor
          n++
          const s = slopeAtPixel(dem, cc, rr)
          if (!Number.isNaN(s)) slopes.push(s)
        }
      }
      heights[k] = Math.round(sum / n)
      slopes.sort((a, b) => a - b)
      slope[k] = Math.min(255, Math.round(slopes[Math.min(slopes.length - 1, Math.floor(slopes.length * 0.9))] ?? 0))

      // Position of the cell center on the Moon, then its terrain horizon.
      const x = (c - dem.center) * dem.scaleM
      const y = -(r - dem.center) * dem.scaleM
      const rho = Math.hypot(x, y)
      const lon = ((Math.atan2(x, y) / RAD) + 360) % 360
      const lat = -90 + (2 * Math.atan(rho / (2 * MOON_RADIUS_M))) / RAD
      const h = computeHorizonFast(dem, lat, lon, heights[k])
      for (let a = 0; a < AZIMUTHS; a++) horizon[k * AZIMUTHS + a] = encodeHorizon(h[a])
    }
  }

  // Hillshade of the zone: heights resampled on a HILLSHADE x HILLSHADE grid (bilinear), light from the northwest.
  const sampleH = (c, r) => {
    const cc = Math.min(Math.max(c, 0), dem.size - 2)
    const rr = Math.min(Math.max(r, 0), dem.size - 2)
    const c0 = Math.floor(cc)
    const r0 = Math.floor(rr)
    const fc = cc - c0
    const fr = rr - r0
    const d = dem.data
    const s = dem.size
    const top = d[r0 * s + c0] * (1 - fc) + d[r0 * s + c0 + 1] * fc
    const bottom = d[(r0 + 1) * s + c0] * (1 - fc) + d[(r0 + 1) * s + c0 + 1] * fc
    return (top * (1 - fr) + bottom * fr) * dem.heightFactor
  }
  const step = (2 * half) / HILLSHADE // map pixels per hillshade pixel
  const hs = new Float32Array(HILLSHADE * HILLSHADE)
  for (let y = 0; y < HILLSHADE; y++) for (let x = 0; x < HILLSHADE; x++) hs[y * HILLSHADE + x] = sampleH(col0 - half + (x + 0.5) * step, row0 - half + (y + 0.5) * step)
  const at = (x, y) => hs[Math.min(Math.max(y, 0), HILLSHADE - 1) * HILLSHADE + Math.min(Math.max(x, 0), HILLSHADE - 1)]
  const spacing = step * dem.scaleM
  const rgba = Buffer.alloc(HILLSHADE * HILLSHADE * 4)
  for (let y = 0; y < HILLSHADE; y++) {
    for (let x = 0; x < HILLSHADE; x++) {
      const dzdx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / (8 * spacing)
      const dzdn = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1)) / (8 * spacing)
      const nx = -2 * dzdx
      const ny = -2 * dzdn
      const shade = Math.max(0, (nx * light[0] + ny * light[1] + light[2]) / Math.hypot(nx, ny, 1))
      const g = 30 + 215 * shade
      const o = (y * HILLSHADE + x) * 4
      rgba[o] = g * 0.96
      rgba[o + 1] = g * 0.98
      rgba[o + 2] = g
      rgba[o + 3] = 255
    }
  }

  const bin = Buffer.concat([Buffer.from(heights.buffer), Buffer.from(slope), Buffer.from(horizon)])
  const meta = {
    id: site.id,
    lat: site.lat,
    lon: site.lon,
    // Center of the zone in the map plane (km from the pole, x east, y toward lon 0), as in the 2.4 km grid.
    centerXKm: Math.round(((col0 - dem.center) * dem.scaleM) / 10) / 100,
    centerYKm: Math.round((-(row0 - dem.center) * dem.scaleM) / 10) / 100,
    sizeKm,
    cells,
    cellM,
    demScaleM: dem.scaleM,
    azimuths: AZIMUTHS,
    slopeOffset: cells * cells * 2,
    horizonOffset: cells * cells * 3,
    minHeightM: Math.min(...heights),
    maxHeightM: Math.max(...heights),
    note: 'LOLA LDEM_80S (NASA PDS). Heights: cell mean in m above the 1737.4 km sphere. Slope: 90th percentile of the map-resolution slopes per cell, degrees.',
  }
  writeFileSync(`${outDir}${site.id}.bin`, bin)
  writeFileSync(`${outDir}${site.id}.json`, JSON.stringify(meta, null, 1) + '\n')
  const png = encodePng(rgba, HILLSHADE, HILLSHADE)
  writeFileSync(`${outDir}${site.id}.png`, png)
  console.log(`${site.id}: ${(bin.length / 1024).toFixed(0)} KB + ${(png.length / 1024).toFixed(0)} KB png, heights ${meta.minHeightM}..${meta.maxHeightM} m, ${((Date.now() - started) / 1000).toFixed(0)} s`)
}
