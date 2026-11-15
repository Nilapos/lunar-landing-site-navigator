// Margin ratios, scores in % of the need and green / orange / red levels, from one simple rule:
//
//   ratio = what the site offers / what the rover needs        (1 = requirement just met)
//   score = 100 x min(ratio, 2), in % of the need                (100 = just met, capped at 200 = twice the need)
//   level = red below ratio 1 (score 100), orange below 1.2 (score 120), green above
//
// So a score never hides a hidden formula: it only says how much margin the site gives over the
// requirement the user typed in.

/** Typical maximum downlink data rate (kbps) per antenna class, from the team's antenna notes. */
export const ANTENNAS = {
  lga: { label: 'Low-gain (LGA)', downlinkKbps: 2 },
  mga: { label: 'Medium-gain (MGA)', downlinkKbps: 500 },
  hga: { label: 'High-gain, X-band', downlinkKbps: 2000 },
  hgaKa: { label: 'High-gain, Ka-band', downlinkKbps: 100000 },
}

/** capacity / need, as a ratio. No need (0) = unlimited margin. */
export function ratio(capacity, need) {
  return need > 0 ? capacity / need : Infinity
}

export const MAX_SCORE = 200 // twice the need: more margin than that adds nothing

/** 0..200, in % of the need: 100 = requirement just met, 200 = at least twice the need. */
export function marginScore(r) {
  if (r === Infinity) return MAX_SCORE
  if (!(r > 0)) return 0
  // Floor (not round) so that a ratio just under 1 never reads as 100 ("just met"); epsilon for float noise.
  return Math.floor(100 * Math.min(r, MAX_SCORE / 100) + 1e-9)
}

export const MARGIN = 0.2 // within 20% of the limit = orange

export function levelFromRatio(r) {
  if (r < 1) return 'fail'
  return r < 1 + MARGIN ? 'warn' : 'ok'
}

/** Same levels from a score (% of the need): below 100 red, below 120 orange, else green. */
export function scoreLevel(score) {
  if (score < 100) return 'fail'
  return score < 100 * (1 + MARGIN) ? 'warn' : 'ok'
}

/** Slope (deg) under which a share `p` (0..1) of a slope histogram (1-degree bins, see terrain.js) lies: the upper edge of the bin where the running total reaches p. */
export function slopePercentile(histogram, p) {
  const total = histogram.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let running = 0
  for (let bin = 0; bin < histogram.length; bin++) {
    running += histogram[bin]
    if (running / total >= p) return bin + 1
  }
  return histogram.length
}

/** Share (0..1) of a slope histogram (1-degree bins, see terrain.js) that is at least `limitDeg` steep. */
export function fractionSteeperThan(histogram, limitDeg) {
  const total = histogram.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  const from = Math.max(0, Math.ceil(limitDeg))
  return histogram.slice(from).reduce((a, b) => a + b, 0) / total
}
