import { formatDay } from '../lib/format.js'
import { niceTicks } from '../lib/scale.js'

const W = 760
const H = 190
const M = { l: 44, r: 12, t: 10, b: 26 }
const DAY_TICKS = 6

// Elevation of a body above the local horizon over time. Above the zero line = visible.
// Shaded bands are the visibility windows; the vertical line is the selected moment.
export default function ElevationChart({ tone, title, samples, windows, cursorMs }) {
  const t0 = samples[0].t
  const t1 = samples[samples.length - 1].t
  const values = samples.map((s) => s.margin)
  const lo = Math.min(...values, -1)
  const hi = Math.max(...values, 1)
  const pad = (hi - lo) * 0.08
  const ticks = niceTicks(lo - pad, hi + pad, 5)
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const x = (t) => M.l + ((t - t0) / (t1 - t0)) * (W - M.l - M.r)
  const y = (v) => M.t + ((yMax - v) / (yMax - yMin)) * (H - M.t - M.b)
  const line = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.margin).toFixed(1)}`).join(' ')
  const days = Array.from({ length: DAY_TICKS + 1 }, (_, k) => t0 + (k * (t1 - t0)) / DAY_TICKS)

  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <svg className="chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} over time`}>
        {windows.map((w) => (
          <rect
            key={w.start}
            className={`chart__window chart__window--${tone}`}
            x={x(w.start)}
            y={M.t}
            width={Math.max(x(w.end) - x(w.start), 1)}
            height={H - M.t - M.b}
          />
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line className={v === 0 ? 'chart__zero' : 'chart__grid'} x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} />
            <text className="chart__tick" x={M.l - 6} y={y(v) + 4} textAnchor="end">
              {v}°
            </text>
          </g>
        ))}
        {days.map((t, k) => (
          <text
            key={t}
            className="chart__tick"
            x={x(t)}
            y={H - 8}
            textAnchor={k === 0 ? 'start' : k === DAY_TICKS ? 'end' : 'middle'}
          >
            {formatDay(t)}
          </text>
        ))}
        <path className={`chart__line chart__line--${tone}`} d={line} />
        <line className="chart__cursor" x1={x(cursorMs)} x2={x(cursorMs)} y1={M.t} y2={H - M.b} />
      </svg>
    </figure>
  )
}
