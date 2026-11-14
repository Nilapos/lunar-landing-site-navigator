// Chart axis helper.

const STEPS = [0.5, 1, 2, 5, 10, 20, 50]

/** Evenly spaced "nice" tick values covering [min, max], about `count` of them. */
export function niceTicks(min, max, count = 5) {
  const span = Math.max(max - min, 1e-9)
  const step = STEPS.find((s) => span / s <= count) ?? STEPS[STEPS.length - 1]
  const first = Math.floor(min / step) * step
  const last = Math.ceil(max / step) * step
  const ticks = []
  for (let v = first; v <= last + step / 2; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}
