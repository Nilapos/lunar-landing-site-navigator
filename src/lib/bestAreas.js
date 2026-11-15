// "Where should we land?": the best areas of the south polar region for a period, found among the 2.4 km cells.
//
// 1. For every cell, the share of the period during which it is "optimal" (slope under the rover's limit, Sun and Earth
//    both above the local horizon): goFractions, the same test as the Optimal layer.
// 2. The cells with the highest share are judged EXACTLY like a site that the user clicks (pointSite + evaluateFromMoment): the
//    same four requirements (power, communication, landing window, terrain), the same /100 scores, measured from a landing
//    moment. Each cell is judged at its own best landing moment: the period start or the start of one of its longest windows
//    where the Sun and the Earth are both up. So the score of the list is the score the user then sees in the Sky card and
//    in the Analysis tab after a click (which jumps the timeline to that moment).
// 3. Areas are ranked by verdict (feasible first), then score; distinct areas are kept 15 km apart. An area that is never
//    feasible, even at its best moment, stays in the list below the others, with the requirement that holds it back.
import { cellSeries } from './cellProbe.js'
import { cellLatLon, goFractions } from './illumination.js'
import { evaluateFromMoment, reasonOf } from './momentScores.js'
import { pointSite } from './pointSite.js'
import { MAP_RADIUS_KM, polarRadiusKm } from './polarMap.js'
import { analyzeScenario } from './scenario.js'

const RANK = { ok: 0, warn: 1, fail: 2 }
const LANDING_MARGIN_MS = 15 * 60000 // land a little after a window opens, not on its edge (same margin as "Move landing to the next window")

/**
 * One cell judged at its best landing moment: { evaluation, landingMs } or null (no data, or too little period left).
 * The moments tried: the period start and the start of the `windowsTried` longest Sun + Earth windows (landed on a sample).
 */
export function judgeCell(terrain, frames, cell, samples, req, { windowsTried = 2 } = {}) {
  const N = terrain.grid
  const { lat, lon } = cellLatLon(N, cell % N, Math.floor(cell / N))
  const site = pointSite(lat, lon, { terrain })
  if (!site) return null
  const series = cellSeries(frames, cell, samples)
  const result = { data: { series }, profile: site.profile, terrain: site.terrainStats }
  const times = series.map((p) => Date.parse(p.t))
  const { both } = analyzeScenario(series, site.profile, { minSunDeg: req.minSunDeg, minEarthDeg: req.minEarthDeg })
  const moments = [times[0]]
  const longest = [...both.windows].sort((a, b) => b.end - b.start - (a.end - a.start)).slice(0, windowsTried)
  for (const w of longest) {
    const wanted = w.startsOpen ? times[0] : w.start + LANDING_MARGIN_MS
    const t = times.find((x) => x >= wanted)
    if (t !== undefined && !moments.includes(t)) moments.push(t)
  }
  let best = null
  for (const landingMs of moments) {
    const evaluation = evaluateFromMoment(result, req, landingMs)
    if (!evaluation) continue
    const better =
      !best ||
      RANK[evaluation.overall] < RANK[best.evaluation.overall] ||
      (evaluation.overall === best.evaluation.overall && evaluation.scores.global > best.evaluation.scores.global)
    if (better) best = { evaluation, landingMs }
  }
  return best
}

/**
 * Best distinct areas, best first. Returns [{ cell, lat, lon, xKm, yKm, score, level, reason, landingMs, goFraction, slopeDeg }];
 * empty when no cell is ever optimal.
 *   terrain, frames: loadTerrain3d and buildCellFrames;  samples: the sky samples of the period;
 *   req: the rover requirements;  options: { count, minSeparationKm, pool, southOfLatDeg }: pool = cells judged in detail;
 *   only cells south of `southOfLatDeg` (-83: where the Artemis III regions are) are proposed. Near the edge of the map the
 *   terrain horizon is cut short (the walk stops at the edge), so those cells look better than they are.
 *   level: 'ok' | 'warn' | 'fail' (the verdict at landingMs, the worst requirement); score: the global score /100 at landingMs.
 */
export function findBestAreas(terrain, frames, samples, req, { count = 8, minSeparationKm = 15, pool = 300, southOfLatDeg = -83 } = {}) {
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
    const best = judgeCell(terrain, frames, c, samples, req)
    if (!best) continue
    const gx = c % N
    const gy = Math.floor(c / N)
    const { lat, lon } = cellLatLon(N, gx, gy)
    judged.push({
      cell: c,
      lat,
      lon,
      xKm: ((gx + 0.5) / N - 0.5) * width,
      yKm: (0.5 - (gy + 0.5) / N) * width,
      score: best.evaluation.scores.global,
      level: best.evaluation.overall,
      reason: reasonOf(best.evaluation),
      landingMs: best.landingMs,
      goFraction: fractions[c],
      slopeDeg: terrain.slope[c],
    })
  }
  judged.sort((a, b) => RANK[a.level] - RANK[b.level] || b.score - a.score || b.goFraction - a.goFraction)

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
