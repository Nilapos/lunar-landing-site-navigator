import { useState } from 'react'
import { classifyCause } from '../lib/cause.js'
import { formatDuration, formatUtc } from '../lib/format.js'
import { nearestIndex } from '../lib/timelineTools.js'
import { horizonAt, stateAt } from '../lib/visibility.js'
import CauseStrip from './CauseStrip.jsx'
import RayDiagram from './RayDiagram.jsx'
import SkyChart from './SkyChart.jsx'

const SUBTABS = [
  { key: 'sky', label: 'Sky chart' },
  { key: 'causes', label: 'Cause strip' },
  { key: 'rays', label: 'Ray diagram' },
]

// Sun or Earth right now, against the terrain: elevation, horizon in that direction, margin, verdict.
function bodyNow(point, body, profile, min) {
  const az = point[`${body}Az`]
  const el = point[`${body}El`]
  const horizon = horizonAt(profile, az)
  const margin = el - horizon - min
  return { az, el, horizon, min, margin, visible: margin > 0, cause: classifyCause(el, horizon, min) }
}

const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`
const VERDICT = { visible: 'Visible', terrain: 'Hidden by terrain', below: 'Below the horizon' }

function NowTable({ site, atMs, now, states }) {
  return (
    <div className="why__now">
      <h3 className="panel__title">
        Why now · {site.shortName} · {formatUtc(atMs)}
      </h3>
      <table className="compare">
        <thead>
          <tr>
            <th scope="col">Body</th>
            <th scope="col">Elevation</th>
            <th scope="col">Terrain horizon there</th>
            <th scope="col">Margin</th>
            <th scope="col">Verdict</th>
            <th scope="col">Next change</th>
          </tr>
        </thead>
        <tbody>
          {['sun', 'earth'].map((body) => {
            const n = now[body]
            const s = states[body]
            return (
              <tr key={body}>
                <th scope="row">{body === 'sun' ? 'Sun' : 'Earth'}</th>
                <td>{signed(n.el)}</td>
                <td>{signed(n.horizon)}</td>
                <td>{signed(n.margin)}</td>
                <td className={n.visible ? 'score score--ok' : 'score score--fail'}>{VERDICT[n.cause]}</td>
                <td>{s.remainingMs === null ? 'not in this period' : `${s.visible ? 'sets' : 'rises'} in ${formatDuration(s.remainingMs)}`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// "Why" tab: for the site of scenario A and the moment of the shared timeline, why the Sun and the Earth are
// visible or not. Everything comes from the scenario's Horizons series and the site's LOLA horizon profile.
export default function Why({ result, requirements, timeline }) {
  const [sub, setSub] = useState('sky')
  const { site, profile, data, analysis, error, loading } = result
  if (error) return <p className="notice notice--error">Could not load the data: {error}</p>
  if (loading || !analysis) return <p className="notice">Loading Sun and Earth positions from NASA JPL Horizons…</p>

  const series = data.series
  const atMs = timeline.sample ? Date.parse(timeline.sample.t) : Date.parse(series[0].t)
  const index = nearestIndex(series, atMs)
  const point = series[index]
  const minDeg = { sun: requirements.minSunDeg, earth: requirements.minEarthDeg }
  const now = { sun: bodyNow(point, 'sun', profile, minDeg.sun), earth: bodyNow(point, 'earth', profile, minDeg.earth) }
  const states = {
    sun: stateAt(analysis.sun.samples, analysis.sun.windows, atMs),
    earth: stateAt(analysis.earth.samples, analysis.earth.windows, atMs),
  }

  return (
    <div className="stage__scroll">
      <div className="tabs" role="group" aria-label="Explanations">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tabs__tab${sub === t.key ? ' tabs__tab--active' : ''}`}
            aria-pressed={sub === t.key}
            onClick={() => setSub(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'sky' && <SkyChart series={series} profile={profile} minDeg={minDeg} index={index} />}
      {sub === 'causes' && (
        <CauseStrip series={series} profile={profile} minDeg={minDeg} atMs={atMs} states={states} nowCauses={{ sun: now.sun.cause, earth: now.earth.cause }} />
      )}
      {sub === 'rays' && <RayDiagram sun={now.sun} earth={now.earth} />}
      <NowTable site={site} atMs={atMs} now={now} states={states} />
      <p className="panel__detail">
        Scenario A: {site.name}. Drag the timeline at the bottom to move the marker. Terrain horizon: LOLA map, one value per degree of
        azimuth; positions: JPL Horizons.
      </p>
    </div>
  )
}
