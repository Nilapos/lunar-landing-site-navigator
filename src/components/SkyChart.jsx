import { skyTrack } from '../lib/cause.js'
import { niceTicks } from '../lib/scale.js'

const W = 900
const H = 320
const M = { l: 44, r: 14, t: 14, b: 30 }
const TRAIL = 16 // samples drawn behind the marker
const COMPASS = [
  [0, 'N'],
  [90, 'E'],
  [180, 'S'],
  [270, 'W'],
  [360, 'N'],
]

// The whole period in the sky of the site: azimuth on x, elevation on y. The dark shape is the terrain horizon.
// Each track is thick and bright where the body is above the terrain, thin and dim elsewhere; the marker shows the
// current moment with a short trail.
export default function SkyChart({ series, profile, minDeg, index }) {
  const top = Math.max(14, Math.max(...profile) + 2, ...series.map((p) => Math.max(p.sunEl, p.earthEl) + 1))
  const ticks = niceTicks(Math.min(-6, Math.min(...profile) - 2), top, 6)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const x = (az) => M.l + (az / 360) * (W - M.l - M.r)
  const y = (el) => M.t + ((hi - el) / (hi - lo)) * (H - M.t - M.b)
  const ridge = Array.from({ length: 361 }, (_, az) => `${x(az).toFixed(1)},${y(profile[az % 360]).toFixed(1)}`)
  const terrain = `M${x(0)},${y(lo)} L${ridge.join(' L')} L${x(360)},${y(lo)} Z`
  const path = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${x(p.az).toFixed(1)},${y(p.el).toFixed(1)}`).join(' ')

  const bodies = [
    { key: 'sun', min: minDeg.sun },
    { key: 'earth', min: minDeg.earth },
  ]
  return (
    <figure className="chart chart--sky">
      <svg className="chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sun and Earth tracks over the period, against the terrain horizon">
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
          <text key={az} className="chart__tick" x={x(az)} y={H - 10} textAnchor="middle">
            {label}
          </text>
        ))}
        {bodies.map(({ key, min }) =>
          skyTrack(series, key, profile, min).map((segment, i) => (
            <path
              key={`${key}-${i}`}
              className={`skychart__track skychart__track--${key}${segment.visible ? ' skychart__track--on' : ''}`}
              d={path(segment.points)}
            />
          )),
        )}
        {bodies.map(({ key }) => {
          const trail = series.slice(Math.max(0, index - TRAIL), index + 1).map((p) => ({ az: p[`${key}Az`], el: p[`${key}El`] }))
          const now = trail[trail.length - 1]
          return (
            <g key={key}>
              {trail.slice(1).map((p, i) =>
                Math.abs(p.az - trail[i].az) > 180 ? null : (
                  <line
                    key={i}
                    className={`skychart__trail skychart__trail--${key}`}
                    style={{ opacity: (i + 1) / trail.length }}
                    x1={x(trail[i].az)}
                    y1={y(trail[i].el)}
                    x2={x(p.az)}
                    y2={y(p.el)}
                  />
                ),
              )}
              <circle className={`sky__body sky__body--${key}`} cx={x(now.az)} cy={y(now.el)} r="7" />
            </g>
          )
        })}
      </svg>
      <figcaption className="sky__legend">
        <span className="legend legend--sun">Sun</span>
        <span className="legend legend--earth">Earth</span>
        <span className="legend legend--terrain">Terrain horizon (LOLA)</span>
        <span>Thick line: the body is above the terrain. Thin line: hidden or below the horizon.</span>
      </figcaption>
    </figure>
  )
}
