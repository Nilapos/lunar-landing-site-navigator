// "Where should we land?": the best areas of the south polar region for a period, found among the 2.4 km cells.
//
// 1. For every cell, the share of the period during which it is "optimal" (slope under the rover's limit, Sun and Earth
//    both above the local horizon): goFractions, the same test as the Optimal layer.
// 2. The cells with the highest share are judged like a site (probeCell): same rules and /100 scores as verdict.js and
//    scores.js, nothing new.
// 3. The best cells are kept one by one, skipping those too close to a better one, so the list shows distinct areas.
import { probeCell } from './cellProbe.js'
import { cellLatLon, goFractions } from './illumination.js'
import { MAP_RADIUS_KM, polarRadiusKm } from './polarMap.js'

/**
 * Best distinct areas, best first. Returns [{ cell, lat, lon, xKm, yKm, score, level, reason, goFraction, fractions,
 * slopeDeg }]; empty when no cell is ever optimal.
 *   terrain, frames: loadTerrain3d and buildCellFrames;  samples: the sky samples of the period;
 *   req: the rover requirements;  options: { count, minSeparationKm, pool, southOfLatDeg }: pool = cells judged in detail;
 *   only cells south of `southOfLatDeg` (-83: where the Artemis III regions are) are proposed. Near the edge of the map the
 *   terrain horizon is cut short (the walk stops at the edge), so those cells look better than they are.
 */
export function findBestAreas(terrain, frames, samples, req, { count = 5, minSeparationKm = 15, pool = 400, southOfLatDeg = -83 } = {}) {
  const N = terrain.grid
  const fractions = goFractions(terrain, frames, samples, { minSunDeg: req.minSunDeg, minEarthDeg: req.minEarthDeg, maxSlopeDeg: req.maxSlopeDeg })
  const maxRadiusKm = polarRadiusKm(southOfLatDeg)
  const candidates = []
  for (let c = 0; c < N * N; c++) {
    if (!(fractions[c] > 0)) continue
    if (cellLatLon(N, c % N, Math.floor(c / N)).edge * MAP_RADIUS_KM > maxRadiusKm) continue
    candidates.push(c)
  }
  candidates.sort((a, b) => fractions[b] - fractions[a])

  const width = 2 * MAP_RADIUS_KM
  const judged = []
  for (const c of candidates.slice(0, pool)) {
    const probe = probeCell(terrain, frames, c, samples, 0, req)
    if (!probe) continue
    const gx = c % N
    const gy = Math.floor(c / N)
    const { lat, lon } = cellLatLon(N, gx, gy)
    judged.push({
      cell: c,
      lat,
      lon,
      xKm: ((gx + 0.5) / N - 0.5) * width,
      yKm: (0.5 - (gy + 0.5) / N) * width,
      score: probe.score,
      level: probe.level,
      reason: probe.reason,
      goFraction: fractions[c],
      fractions: probe.fractions,
      slopeDeg: probe.slopeDeg,
    })
  }
  judged.sort((a, b) => b.score - a.score || b.goFraction - a.goFraction)

  const kept = []
  for (const area of judged) {
    if (kept.every((k) => Math.hypot(k.xKm - area.xKm, k.yKm - area.yKm) >= minSeparationKm)) kept.push(area)
    if (kept.length === count) break
  }
  return kept
}

/**
 * The closest known site to an area, within `maxKm`: { site, distanceKm } or null. `sites`: [{ lat, lon, shortName }].
 * Distances are on the map plane (km from the pole), accurate enough at this scale.
 */
export function nearestSite(area, sites, maxKm = 40) {
  let best = null
  for (const site of sites) {
    const rho = polarRadiusKm(site.lat)
    const lon = (site.lon * Math.PI) / 180
    const distanceKm = Math.hypot(rho * Math.sin(lon) - area.xKm, rho * Math.cos(lon) - area.yKm)
    if (distanceKm <= maxKm && (!best || distanceKm < best.distanceKm)) best = { site, distanceKm }
  }
  return best
}
