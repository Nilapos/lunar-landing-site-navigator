// Margin ratios, /100 scores and green / orange / red levels, from one simple rule:
//
//   ratio = what the site offers / what the rover needs        (1 = requirement just met)
//   score = 100 x min(ratio / 2, 1)                              (50 = just met, 100 = twice the need)
//   level = red below ratio 1, orange below 1.2 (score 60), green above
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

/** 0..100: 50 = requirement just met, 100 = at least twice the margin. */
export function marginScore(r) {
  if (r === Infinity) return 100
  if (!(r > 0)) return 0
  // Floor (not round) so that a ratio just under 1 never reads as 50 ("just met"); epsilon for float noise.
  return Math.floor(100 * Math.min(r / 2, 1) + 1e-9)
}

export const MARGIN = 0.2 // within 20% of the limit = orange

export function levelFromRatio(r) {
  if (r < 1) return 'fail'
  return r < 1 + MARGIN ? 'warn' : 'ok'
}

/** Same levels from a /100 score: below 50 red, below 60 orange, else green. */
export function scoreLevel(score) {
  if (score < 50) return 'fail'
  return score < 100 * ((1 + MARGIN) / 2) ? 'warn' : 'ok'
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
