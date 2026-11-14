// "Is this a good landing zone?" for one cell of the 3D grid (2.4 km wide), from the same data as the layers:
// the cell's terrain horizon (horizonGrid.js), its slope, and the sky samples of the period.
// The verdict uses the rules of verdict.js and scores.js (ratio = offered / needed), nothing new.
import { horizonAtCell } from './horizonGrid.js'
import { levelFromRatio, marginScore, ratio } from './scores.js'
import { azEl, earthDirection, unitVector } from './sky.js'
import { commsItem, powerItem } from './verdict.js'
import { findWindows, summarize } from './visibility.js'

const ORDER = { ok: 0, warn: 1, fail: 2 }

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
 * Everything the hover card shows for a cell, or null when the cell has no data (outside the 80 S circle).
 *   terrain: loadTerrain3d;  frames: buildCellFrames;  samples: /api/sky samples of the period;  index: the moment shown;
 *   req: the rover requirements (maxSlopeDeg, minSunDeg, minEarthDeg, batteryHours, linkMinPerHour, bandwidthKbps, antenna).
 * Returns { slopeDeg, now: { sun, earth }, fractions: { sun, earth, both }, items, level, score, reason }.
 */
export function probeCell(terrain, frames, cell, samples, index, req) {
  if (!frames.valid[cell]) return null
  const frame = cellFrame(frames, cell)
  const series = samples.map((s) => ({ t: Date.parse(s.t), ...cellSky(terrain, frame, cell, s, req.minSunDeg, req.minEarthDeg) }))
  const analyze = (margin) => {
    const points = series.map((p) => ({ t: p.t, margin: margin(p) }))
    return { summary: summarize(points, findWindows(points)) }
  }
  const sun = analyze((p) => p.sun.margin)
  const earth = analyze((p) => p.earth.margin)
  const both = analyze((p) => Math.min(p.sun.margin, p.earth.margin))

  const slopeDeg = terrain.slope[cell]
  const earthHidden = Math.round(100 * (1 - earth.summary.visibleFraction))
  const raw = [
    {
      key: 'terrain',
      ratio: ratio(req.maxSlopeDeg, slopeDeg),
      reason: `too steep: ${slopeDeg}° for a ${req.maxSlopeDeg}° limit`,
    },
    { key: 'power', ...powerItem(sun, req) },
    { key: 'comms', ...commsItem(earth, req), reason: `Earth hidden for ${earthHidden}% of the period` },
  ]
  const items = raw.map((i) => ({ ...i, score: marginScore(i.ratio), level: levelFromRatio(i.ratio) }))
  // The reason shown is the weakest requirement (the first one when several are as weak).
  const worst = items.reduce((w, i) => (ORDER[i.level] > ORDER[w.level] || (i.level === w.level && i.ratio < w.ratio) ? i : w))
  const now = series[index]
  return {
    slopeDeg,
    now: { sun: now.sun, earth: now.earth },
    fractions: { sun: sun.summary.visibleFraction, earth: earth.summary.visibleFraction, both: both.summary.visibleFraction },
    items,
    level: worst.level,
    score: Math.round(items.reduce((sum, i) => sum + i.score, 0) / items.length),
    reason: worst.level === 'ok' ? 'every requirement is met with margin' : (worst.reason ?? worst.detail),
  }
}
