// Checks the sourced site coordinates against the LOLA south polar map and finds the Malapert summit.
//
// Usage: node scripts/find-rim-points.mjs "<path to ldem_80s_80m.img>"
// Prints the terrain height at each sourced point (a sanity check: rims and peaks should be high, crater
// floors low) and the highest LOLA point near 86 S 0 E, which is the Malapert massif summit.
// Note: a "highest point on the rim ring" search around crater centers was tried and dropped: around Haworth
// it returns the flank of the Malapert massif 30 km away, so it is not reliable.
import { readFileSync } from 'node:fs'
import { endianness } from 'node:os'
import { MOON_RADIUS_M, createDem, heightAt, toPixel } from '../src/lib/terrain.js'

const demPath = process.argv[2]
if (!demPath) {
  console.error('Usage: node scripts/find-rim-points.mjs <path to ldem_80s_80m.img>')
  process.exit(1)
}
if (endianness() !== 'LE') throw new Error('This script assumes a little-endian machine')
const buf = readFileSync(demPath)
const dem = createDem(new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2))
const RAD = Math.PI / 180

// Inverse of toPixel: pixel -> lat/lon (degrees, east longitude 0..360).
function toLatLon(col, row) {
  const x = (col - dem.center) * dem.scaleM
  const y = (dem.center - row) * dem.scaleM
  const rho = Math.hypot(x, y)
  const lat = -90 + (2 * Math.atan(rho / (2 * MOON_RADIUS_M))) / RAD
  const lon = (Math.atan2(x, y) / RAD + 360) % 360
  return [lat, lon]
}

// Distance in km between two lat/lon points.
function distanceKm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * RAD
  const p2 = lat2 * RAD
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2
  return (2 * MOON_RADIUS_M * Math.asin(Math.sqrt(a))) / 1000
}

function highestWithin(lat, lon, radiusKm) {
  const [col, row] = toPixel(dem, lat, lon)
  const reach = Math.ceil((radiusKm * 1000) / dem.scaleM) + 2
  let best = { h: -Infinity }
  for (let r = Math.round(row) - reach; r <= Math.round(row) + reach; r++) {
    for (let c = Math.round(col) - reach; c <= Math.round(col) + reach; c++) {
      const [la, lo] = toLatLon(c, r)
      if (distanceKm(lat, lon, la, lo) > radiusKm) continue
      const h = dem.data[r * dem.size + c] * dem.heightFactor
      if (h > best.h) best = { h, lat: la, lon: lo }
    }
  }
  return best
}

// Malapert Mountain: its peak lies almost exactly at 0 deg longitude (Wikipedia, "Malapert (crater)").
const summit = highestWithin(-85.99, 0, 10)
console.log(`Malapert summit: lat ${summit.lat.toFixed(3)} lon ${summit.lon.toFixed(3)} height ${summit.h.toFixed(0)} m`)

// The highest point within 15 km of the pole: the ridge between Shackleton and de Gerlache.
const ridge = highestWithin(-89.9999, 0, 15)
console.log(`Highest point within 15 km of the pole: lat ${ridge.lat.toFixed(3)} lon ${ridge.lon.toFixed(3)} height ${ridge.h.toFixed(0)} m`)

// Height at each sourced point.
const points = [
  ['IM-2 intended site (LROC)', -84.78, 29.13],
  ["Chang'e-7 planned site (Wikipedia)", -88.8, 123.4],
  ['Nobile Rim 2 point (published study)', -84.20156, 60.69989],
  ['Shackleton center (IAU)', -89.6667, 129.7833],
]
for (const [name, lat, lon] of points) {
  console.log(`${name.padEnd(40)} height ${heightAt(dem, lat, lon).toFixed(0)} m`)
}
