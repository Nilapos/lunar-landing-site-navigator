// Turns Sun/Earth elevation series into visibility windows (power and direct-to-Earth comms).
//
// A body is visible when its elevation is above the local horizon. The horizon is 0 degrees on a
// smooth sphere; with terrain it is a profile: an array of 360 elevations (deg), one per whole
// degree of azimuth (0 = north, clockwise). See the terrain step for how profiles are produced.

/** Horizon elevation (deg) at an azimuth, interpolated linearly. No profile = flat horizon at 0. */
export function horizonAt(profile, az) {
  if (!profile) return 0
  const a = ((az % 360) + 360) % 360
  const i = Math.floor(a)
  const f = a - i
  return profile[i] * (1 - f) + profile[(i + 1) % profile.length] * f
}

/** Elevation above the local horizon over time: [{ t (ms), margin (deg) }]. body = 'sun' | 'earth'. */
export function marginSeries(series, body, profile = null) {
  return series.map((p) => ({
    t: Date.parse(p.t),
    margin: p[`${body}El`] - horizonAt(profile, p[`${body}Az`]),
  }))
}

/** Intervals where margin > 0. Crossings are interpolated linearly between samples. */
export function findWindows(samples) {
  const windows = []
  let open = null
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const visible = s.margin > 0
    if (i === 0) {
      if (visible) open = { start: s.t, startsOpen: true }
      continue
    }
    const prev = samples[i - 1]
    const wasVisible = prev.margin > 0
    if (wasVisible === visible) continue
    const cross = prev.t + ((0 - prev.margin) / (s.margin - prev.margin)) * (s.t - prev.t)
    if (visible) {
      open = { start: cross, startsOpen: false }
    } else {
      windows.push({ start: open.start, end: cross, startsOpen: open.startsOpen, endsOpen: false })
      open = null
    }
  }
  if (open) windows.push({ start: open.start, end: samples[samples.length - 1].t, startsOpen: open.startsOpen, endsOpen: true })
  return windows
}

/** Key numbers for one body over the whole series. Durations in milliseconds. */
export function summarize(samples, windows) {
  const first = samples[0].t
  const last = samples[samples.length - 1].t
  const visibleMs = windows.reduce((sum, w) => sum + (w.end - w.start), 0)
  const gaps = []
  let cursor = first
  for (const w of windows) {
    gaps.push(w.start - cursor)
    cursor = w.end
  }
  gaps.push(last - cursor)
  return {
    visibleFraction: last > first ? visibleMs / (last - first) : 0,
    windowCount: windows.length,
    longestGapMs: Math.max(...gaps),
    maxMargin: Math.max(...samples.map((s) => s.margin)),
  }
}

/** State at time `atMs`: is the body visible, and when does that change (null if not in the series)? */
export function stateAt(samples, windows, atMs) {
  const current = windows.find((w) => atMs >= w.start && atMs < w.end)
  if (current) {
    return { visible: true, changeAt: current.endsOpen ? null : current.end, remainingMs: current.endsOpen ? null : current.end - atMs }
  }
  const next = windows.find((w) => w.start > atMs)
  return { visible: false, changeAt: next ? next.start : null, remainingMs: next ? next.start - atMs : null }
}

/** One-call analysis of a body at a site: windows, summary and state at `atMs`. */
export function analyzeBody(series, body, profile = null, atMs = Date.parse(series[0].t)) {
  const samples = marginSeries(series, body, profile)
  const windows = findWindows(samples)
  return { windows, summary: summarize(samples, windows), now: stateAt(samples, windows, atMs) }
}
