// "Is this a good landing zone?" for one cell of the 3D grid (2.4 km wide), from the same data as the layers:
// the cell's terrain horizon (horizonGrid.js), its slope, and the sky samples of the period.
// The verdict uses the rules of verdict.js and scores.js (ratio = offered / needed), nothing new.
import { horizonAtCell } from './horizonGrid.js'
import { analyzeFromMoment, reasonOf } from './momentScores.js'
import { cellStats } from './pointSite.js'
import { azEl, earthDirection, unitVector } from './sky.js'

function cellFrame(frames, cell) {
  const at = (a) => [a[cell * 3], a[cell * 3 + 1], a[cell * 3 + 2]]
  return { up: at(frames.up), east: at(frames.east), north: at(frames.north) }
}

/** Sun and Earth above the cell's own horizon at one instant: { sun, earth }, each { az, el, horizon, margin }. */
function cellSky(terrain, frame, cell, sample, minSunDeg, minEarthDeg) {
  const state = (direction, min) => {
    const { az, el } = azEl(frame, direction)
    const horizon = horizonAtCell(terrain.horizon, cell, az)
    return { az, el, horizon, margin: el - horizon - min }
  }
  return {
    sun: state(unitVector(sample.sunLat, sample.sunLon), minSunDeg),
    earth: state(earthDirection(frame.up, sample.earthLat, sample.earthLon, sample.earthKm), minEarthDeg),
  }
}

/**
 * The Sun and Earth az/el of a cell over the sky samples, in the shape of the series of a site (horizons.js): [{ t, sunAz, sunEl,
 * earthAz, earthEl }]. Same numbers as the per-site Horizons series to a few thousandths of a degree (sky.js), so a cell can be
 * judged with the full scenario rules (evaluateScenario) like a site.
 */
export function cellSeries(frames, cell, samples) {
  const frame = cellFrame(frames, cell)
  return samples.map((s) => {
    const sun = azEl(frame, unitVector(s.sunLat, s.sunLon))
    const earth = azEl(frame, earthDirection(frame.up, s.earthLat, s.earthLon, s.earthKm))
    return { t: s.t, sunAz: sun.az, sunEl: sun.el, earthAz: earth.az, earthEl: earth.el }
  })
}

// The series and the site statistics of the cells hovered, kept while the samples stay the same (the pointer crosses many cells).
const cache = new WeakMap() // terrain -> { samples, cells: Map(cell -> { series, stats }) }
function cellData(terrain, frames, cell, samples) {
  let entry = cache.get(terrain)
  if (!entry || entry.samples !== samples) {
    entry = { samples, cells: new Map() }
    cache.set(terrain, entry)
  }
  let data = entry.cells.get(cell)
  if (!data) {
    if (entry.cells.size > 400) entry.cells.clear()
    data = { series: cellSeries(frames, cell, samples), stats: cellStats(terrain, cell, terrain.grid) }
    entry.cells.set(cell, data)
  }
  return data
}

/**
 * Everything the hover card shows for a cell, or null when the cell has no data (outside the 80 S circle). The verdict is the one of a
 * landing at the moment shown, over the mission that follows it (requirements.missionDays): the same evaluation as the Sky card and as the
 * click on the cell (the four requirements, the same scores), not a different one over the whole period.
 *   terrain: loadTerrain3d (or a chunk / zone: terrain.grid cells per side);  frames: buildCellFrames;  samples: /api/sky samples of the range;
 *   index: the moment shown;  req: the mission requirements (maxSlopeDeg, minSunDeg, minEarthDeg, batteryHours, linkMinPerHour, ..., missionDays).
 * Returns { slopeDeg, now: { sun, earth }, fractions: { sun, earth, both } (over the mission), items, level, score, reason }.
 */
export function probeCell(terrain, frames, cell, samples, index, req) {
  if (!frames.valid[cell]) return null
  const frame = cellFrame(frames, cell)
  const { series, stats } = cellData(terrain, frames, cell, samples)
  const now = cellSky(terrain, frame, cell, samples[index], req.minSunDeg, req.minEarthDeg)
  const result = { data: { series }, profile: stats.profile, terrain: stats.terrainStats }
  const judged = analyzeFromMoment(result, req, Date.parse(samples[index].t))
  const slopeDeg = terrain.slope[cell]
  if (!judged) {
    // The last moment of the range: nothing is left to judge.
    return { slopeDeg, now, fractions: { sun: 0, earth: 0, both: 0 }, items: [], level: 'fail', score: 0, reason: 'The range ends here: nothing is left to judge.' }
  }
  const { analysis, evaluation } = judged
  return {
    slopeDeg,
    now,
    fractions: { sun: analysis.sun.summary.visibleFraction, earth: analysis.earth.summary.visibleFraction, both: analysis.both.summary.visibleFraction },
    items: evaluation.items,
    level: evaluation.overall,
    score: evaluation.scores.global,
    reason: reasonOf(evaluation),
  }
}
