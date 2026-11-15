// Precompute terrain horizon profiles for the south pole sites.
//
// Usage: node scripts/compute-horizons.mjs "<path to ldem_80s_*.img>" [--slopes-only]
//   --slopes-only: only rewrite site-terrain.json (slopes), leave the horizon profiles as they are. The map can be any LDEM_80S
//   product (80, 40 or 20 m per pixel, see createDemAuto); the slopes then are at that resolution.
// Get the map from NASA PDS (115.5 MB, NOT committed to the repo):
//   https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.img
// Output: src/data/horizon-profiles.json  ({ profiles: { <siteId>: [360 elevations in deg] } })
//         src/data/site-terrain.json      ({ sites: { <siteId>: { elevationM, slopeMeanDeg, slopeMaxDeg, histogram500 } } })
import { readFileSync, writeFileSync } from 'node:fs'
import { endianness } from 'node:os'
import { fileURLToPath } from 'node:url'
import { southPoleSites } from '../src/data/south-pole-sites.js'
import { computeHorizonProfile, createDemAuto, heightAt, slopeStats } from '../src/lib/terrain.js'

const args = process.argv.slice(2)
const demPath = args.find((a) => !a.startsWith('--'))
const slopesOnly = args.includes('--slopes-only')
if (!demPath) {
  console.error('Usage: node scripts/compute-horizons.mjs <path to ldem_80s_*.img> [--slopes-only]')
  process.exit(1)
}
if (endianness() !== 'LE') throw new Error('This script assumes a little-endian machine')

const buf = readFileSync(demPath)
const dem = createDemAuto(new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2))

const profiles = {}
const terrain = {}
for (const site of southPoleSites) {
  const profile = slopesOnly ? null : computeHorizonProfile(dem, site.lat, site.lon)
  if (profile) profiles[site.id] = profile
  terrain[site.id] = slopeStats(dem, site.lat, site.lon)
  console.log(
    `${site.id.padEnd(20)} ground ${heightAt(dem, site.lat, site.lon).toFixed(0).padStart(6)} m   horizon ${profile ? `min ${Math.min(...profile).toFixed(2)}  max ${Math.max(...profile).toFixed(2)} deg` : "(kept)"}   slope mean ${terrain[site.id].slopeMeanDeg} max ${terrain[site.id].slopeMaxDeg} deg`,
  )
}

const terrainOut = fileURLToPath(new URL('../src/data/site-terrain.json', import.meta.url))
writeFileSync(
  terrainOut,
  JSON.stringify({
    source: `LOLA LDEM_80S_${dem.scaleM}M (NASA PDS), slopes at ${dem.scaleM} m resolution (Horn method)`,
    radiusM: 100,
    histogramRadiusM: 500,
    sites: terrain,
  }) + '\n',
)
console.log(`Wrote ${terrainOut}`)

if (slopesOnly) process.exit(0)

const out = fileURLToPath(new URL('../src/data/horizon-profiles.json', import.meta.url))
writeFileSync(
  out,
  JSON.stringify({ source: 'LOLA LDEM_80S_80M (NASA PDS)', observerHeightM: 0, maxDistanceM: 200000, profiles }) + '\n',
)
console.log(`Wrote ${out}`)
