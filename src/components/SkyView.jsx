import { niceTicks } from '../lib/scale.js'

const W = 760
const H = 280
const M = { l: 44, r: 12, t: 12, b: 28 }
const COMPASS = [
  [0, 'N'],
  [90, 'E'],
  [180, 'S'],
  [270, 'W'],
  [360, 'N'],
]

// Sky as seen from the site: azimuth on x, elevation on y. The filled shape is the terrain horizon;
// a body is visible when its marker is above it.
export default function SkyView({ profile, sun, earth, yMax }) {
  const yMin = Math.min(-6, Math.min(...profile) - 2)
  const ticks = niceTicks(yMin, yMax, 6)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const x = (az) => M.l + (az / 360) * (W - M.l - M.r)
  const y = (el) => M.t + ((hi - el) / (hi - lo)) * (H - M.t - M.b)

  const ridge = Array.from({ length: 361 }, (_, az) => `${x(az).toFixed(1)},${y(profile[az % 360]).toFixed(1)}`)
  const terrain = `M${x(0)},${y(lo)} L${ridge.join(' L')} L${x(360)},${y(lo)} Z`

  return (
    <figure className="sky">
      <svg className="sky__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sun and Earth above the terrain horizon">
        {ticks.map((v) => (
          <g key={v}>
            <line className={v === 0 ? 'chart__zero' : 'chart__grid'} x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} />
            <text className="chart__tick" x={M.l - 6} y={y(v) + 4} textAnchor="end">
              {v}°
            </text>
          </g>
        ))}
        <path className="sky__terrain" d={terrain} />
        {COMPASS.map(([az, label]) => (
          <text key={az} className="chart__tick" x={x(az)} y={H - 8} textAnchor="middle">
            {label}
          </text>
        ))}
        <circle className="sky__body sky__body--earth" cx={x(earth.az)} cy={y(earth.el)} r="7" />
        <circle className="sky__body sky__body--sun" cx={x(sun.az)} cy={y(sun.el)} r="7" />
      </svg>
      <figcaption className="sky__legend">
        <span className="legend legend--sun">Sun</span>
        <span className="legend legend--earth">Earth</span>
        <span className="legend legend--terrain">Terrain horizon (LOLA)</span>
      </figcaption>
    </figure>
  )
}
