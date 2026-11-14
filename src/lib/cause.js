// Why is a body (Sun or Earth) visible or not at a site? Three possible states for each sample:
//   visible  = above the terrain horizon (plus the minimum elevation asked by the rover)
//   terrain  = above the flat horizon (0 degrees) but hidden: a ridge is in the way
//   below    = under the flat horizon too: night for the Sun, "Earth has set" for the Earth
// "visible" takes precedence: on a summit the terrain horizon can be below 0 degrees, and a body just
// under 0 degrees is then still visible.
import { horizonAt } from './visibility.js'

export const CAUSE_LABEL = {
  visible: 'Visible',
  terrain: 'Hidden by terrain',
  below: 'Below the flat horizon',
}

export function classifyCause(elDeg, horizonDeg, minDeg = 0) {
  if (elDeg - horizonDeg - minDeg > 0) return 'visible'
  return elDeg > 0 ? 'terrain' : 'below'
}

/**
 * The series (see horizons.js) cut into runs of one cause: [{ cause, start, end }] in ms.
 * A run ends where the next one starts, and the last one at the last sample.
 */
export function causeSegments(series, body, profile, minDeg = 0) {
  const out = []
  series.forEach((p, i) => {
    const cause = classifyCause(p[`${body}El`], horizonAt(profile, p[`${body}Az`]), minDeg)
    const t = Date.parse(p.t)
    const last = out[out.length - 1]
    if (last && last.cause === cause) {
      last.end = t
    } else {
      if (last) last.end = t
      out.push({ cause, start: t, end: t })
    }
    if (i === series.length - 1 && out.length) out[out.length - 1].end = t
  })
  return out
}

/**
 * Path of a body in the (azimuth, elevation) sky, cut where it goes from visible to hidden (the two pieces share
 * the crossing sample) and where the azimuth wraps around from 360 to 0: [{ visible, points: [{ az, el, t }] }].
 */
export function skyTrack(series, body, profile, minDeg = 0) {
  const segments = []
  let current = null
  let previous = null
  for (const p of series) {
    const point = { az: p[`${body}Az`], el: p[`${body}El`], t: Date.parse(p.t) }
    const visible = point.el - horizonAt(profile, point.az) - minDeg > 0
    const wrapped = previous && Math.abs(point.az - previous.az) > 180
    if (!current || wrapped || current.visible !== visible) {
      const start = previous && !wrapped ? [previous] : []
      current = { visible, points: [...start, point] }
      segments.push(current)
    } else {
      current.points.push(point)
    }
    previous = point
  }
  return segments
}
