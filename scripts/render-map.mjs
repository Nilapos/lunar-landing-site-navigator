// Renders the hillshaded picture of the south polar region used as the background of the map.
//
// Usage: node scripts/render-map.mjs "<path to ldem_80s_80m.img>"
// Output: public/south-pole-hillshade.png (1024 x 1024, transparent outside the 80 S circle).
// The picture uses the same projection as the LOLA map: longitude 0 at the top, 90 E to the right
// (see src/lib/polarMap.js). Light comes from the northwest at a low angle, exaggerated relief.
import { readFileSync, writeFileSync } from 'node:fs'
import { endianness } from 'node:os'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { createDem } from '../src/lib/terrain.js'

const demPath = process.argv[2]
if (!demPath) {
  console.error('Usage: node scripts/render-map.mjs <path to ldem_80s_80m.img>')
  process.exit(1)
}
if (endianness() !== 'LE') throw new Error('This script assumes a little-endian machine')

const OUT = 1024
const buf = readFileSync(demPath)
const dem = createDem(new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2))
const block = dem.size / OUT // DEM pixels per output pixel
const cellM = block * dem.scaleM

// 1. Downsample heights (box average) so the picture is not aliased.
const height = new Float32Array(OUT * OUT)
for (let oy = 0; oy < OUT; oy++) {
  for (let ox = 0; ox < OUT; ox++) {
    const x0 = Math.floor(ox * block)
    const x1 = Math.max(x0 + 1, Math.floor((ox + 1) * block))
    const y0 = Math.floor(oy * block)
    const y1 = Math.max(y0 + 1, Math.floor((oy + 1) * block))
    let sum = 0
    let n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += dem.data[y * dem.size + x]; n++ }
    height[oy * OUT + ox] = (sum / n) * dem.heightFactor
  }
}

// 2. Hillshade: surface normal from neighbors, light from the northwest at 25 degrees, relief x3.
const RAD = Math.PI / 180
const EXAGGERATION = 3
const az = 315 * RAD
const alt = 25 * RAD
const light = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)] // east, north, up
const at = (x, y) => height[Math.min(Math.max(y, 0), OUT - 1) * OUT + Math.min(Math.max(x, 0), OUT - 1)]

const rgba = Buffer.alloc(OUT * OUT * 4)
for (let y = 0; y < OUT; y++) {
  for (let x = 0; x < OUT; x++) {
    const i = (y * OUT + x) * 4
    const dx = x + 0.5 - OUT / 2
    const dy = y + 0.5 - OUT / 2
    if (Math.hypot(dx, dy) > OUT / 2) continue // outside the 80 S circle: stays transparent
    const dzdx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) / (8 * cellM)
    // Image rows grow downward (toward lon 180), so "north" (up) is the opposite direction.
    const dzdn = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1)) / (8 * cellM)
    const nx = -EXAGGERATION * dzdx
    const ny = -EXAGGERATION * dzdn
    const len = Math.hypot(nx, ny, 1)
    const shade = Math.max(0, (nx * light[0] + ny * light[1] + light[2]) / len)
    const g = 30 + 215 * shade
    const t = Math.min(Math.max((height[y * OUT + x] + 4000) / 9000, 0), 1) // low = bluish, high = neutral
    rgba[i] = g * (0.88 + 0.12 * t)
    rgba[i + 1] = g * (0.92 + 0.08 * t)
    rgba[i + 2] = g
    rgba[i + 3] = 255
  }
}

// 3. Minimal PNG writer (RGBA, 8 bit): no dependency needed.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(OUT, 0)
ihdr.writeUInt32BE(OUT, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc(OUT * (OUT * 4 + 1))
for (let y = 0; y < OUT; y++) rgba.copy(raw, y * (OUT * 4 + 1) + 1, y * OUT * 4, (y + 1) * OUT * 4) // filter byte 0 per row
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = fileURLToPath(new URL('../public/south-pole-hillshade.png', import.meta.url))
writeFileSync(out, png)
console.log(`Wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`)
