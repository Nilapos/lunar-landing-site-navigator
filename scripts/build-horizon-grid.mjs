// Computes the terrain horizon of every cell of the 3D grid (72 azimuths per cell), from the LOLA map.
//
// Usage: node scripts/build-horizon-grid.mjs "<path to ldem_80s_80m.img>"
// Output: public/south-pole-horizon.bin  (Uint8, GRID x GRID x 72; see src/lib/horizonGrid.js for the encoding).
// Cells outside the 80 S circle hold 0 (no data). Takes about a minute.
// Run scripts/build-3d-data.mjs first (it writes the description file this one relies on).
import { readFileSync, writeFileSync } from 'node:fs'
import { endianness } from 'node:os'
import { fileURLToPath } from 'node:url'
import { AZIMUTHS, computeHorizonFast, encodeHorizon } from '../src/lib/horizonGrid.js'
import { MAP_RADIUS_KM } from '../src/lib/polarMap.js'
import { MOON_RADIUS_M, createDem, heightAt } from '../src/lib/terrain.js'

const demPath = process.argv[2]
if (!demPath) {
  console.error('Usage: node scripts/build-horizon-grid.mjs <path to ldem_80s_80m.img>')
  process.exit(1)
}
if (endianness() !== 'LE') throw new Error('This script assumes a little-endian machine')

const meta = JSON.parse(readFileSync(new URL('../public/south-pole-3d.json', import.meta.url), 'utf8'))
const N = meta.grid
const buf = readFileSync(demPath)
const dem = createDem(new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2))
const RAD = Math.PI / 180
const widthKm = 2 * MAP_RADIUS_KM

const out = new Uint8Array(N * N * AZIMUTHS)
let done = 0
let inside = 0
const started = Date.now()
for (let gy = 0; gy < N; gy++) {
  for (let gx = 0; gx < N; gx++) {
    // Center of the cell: east x and "up" y (toward lon 0), in km from the pole.
    const x = ((gx + 0.5) / N - 0.5) * widthKm
    const y = (0.5 - (gy + 0.5) / N) * widthKm
    const rho = Math.hypot(x, y)
    if (rho > MAP_RADIUS_KM * 0.995) continue // outside the 80 S circle
    inside++
    const lon = ((Math.atan2(x, y) / RAD) + 360) % 360
    const lat = -90 + (2 * Math.atan((rho * 1000) / (2 * MOON_RADIUS_M))) / RAD
    const ground = heightAt(dem, lat, lon)
    const horizon = computeHorizonFast(dem, lat, lon, ground)
    const base = (gy * N + gx) * AZIMUTHS
    for (let k = 0; k < AZIMUTHS; k++) out[base + k] = encodeHorizon(horizon[k])
  }
  done++
  if (done % 32 === 0) console.log(`row ${done}/${N}  (${((Date.now() - started) / 1000).toFixed(0)} s)`)
}

const file = fileURLToPath(new URL('../public/south-pole-horizon.bin', import.meta.url))
writeFileSync(file, out)
console.log(`Wrote ${file}: ${inside} cells x ${AZIMUTHS} azimuths, ${(out.length / 1024 / 1024).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(0)} s`)
