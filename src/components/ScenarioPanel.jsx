import { useState } from 'react'
import { southPoleSites } from '../data/south-pole-sites.js'
import { addMinutesIso, formatDuration, formatPercent, formatUtc } from '../lib/format.js'
import { horizonAt, stateAt } from '../lib/visibility.js'
import ElevationChart from './ElevationChart.jsx'
import MetricCard from './MetricCard.jsx'
import ScoreBar from './ScoreBar.jsx'
import SiteControls from './SiteControls.jsx'
import SkyView from './SkyView.jsx'
import Verdict from './Verdict.jsx'

const SHIFT_MARGIN_MIN = 15 // land a little after the window opens, not exactly on its edge

// "Sunset in 3 h 10 min" / "Earthrise in 2.6 days" / "Sun above the horizon until the end of the period".
function countdown(state, subject) {
  if (state.remainingMs === null) {
    return `${subject} ${state.visible ? 'above' : 'below'} the horizon until the end of the period`
  }
  return `${subject}${state.visible ? 'set' : 'rise'} in ${formatDuration(state.remainingMs)}`
}

// One scenario (site + landing date and time + period): controls, verdict, key figures, sky view, timelines.
// `result` comes from useScenario, `evaluation` from evaluateScenario; `state` / `onChange` hold the controls.
export default function ScenarioPanel({ title, state, onChange, result, evaluation, embedded = false }) {
  const [cursor, setCursor] = useState(0)
  const { profile, data, error, loading, analysis } = result

  const update = (patch) => {
    onChange({ ...state, ...patch })
    setCursor(0)
  }

  let body
  if (error) {
    body = <p className="notice notice--error">Could not load the data: {error}</p>
  } else if (loading || !analysis || !evaluation) {
    body = <p className="notice">Loading Sun and Earth positions from NASA JPL Horizons…</p>
  } else {
    const series = data.series
    const index = Math.min(cursor, series.length - 1)
    const point = series[index]
    const atMs = Date.parse(point.t)
    const { sun, earth } = analysis
    const sunState = stateAt(sun.samples, sun.windows, atMs)
    const earthState = stateAt(earth.samples, earth.windows, atMs)
    const yMax = Math.max(
      10,
      Math.max(...profile) + 4,
      Math.max(...series.map((p) => p.sunEl)) + 2,
      Math.max(...series.map((p) => p.earthEl)) + 2,
    )

    body = (
      <>
        <ScoreBar evaluation={evaluation} />
        {!embedded && (
          <Verdict
            evaluation={evaluation}
            onShiftLanding={(ms) => update({ start: addMinutesIso(state.start, Math.ceil(ms / 60000) + SHIFT_MARGIN_MIN) })}
          />
        )}

        <section className="metrics" aria-label="Key figures">
          <MetricCard
            tone="sun"
            title="Power (Sun)"
            subtitle="Solar panels need the Sun above the local horizon."
            status={countdown(sunState, 'Sun')}
            visible={sunState.visible}
            stats={[
              { label: 'Sunlit', value: formatPercent(sun.summary.visibleFraction) },
              { label: 'Longest darkness', value: formatDuration(sun.summary.longestGapMs) },
              { label: 'Highest vs horizon', value: `${sun.summary.maxMargin.toFixed(1)}°` },
            ]}
          />
          <MetricCard
            tone="earth"
            title="Communication (Earth)"
            subtitle="Direct-to-Earth link needs Earth above the local horizon."
            status={countdown(earthState, 'Earth')}
            visible={earthState.visible}
            stats={[
              { label: 'Earth visible', value: formatPercent(earth.summary.visibleFraction) },
              { label: 'Longest outage', value: formatDuration(earth.summary.longestGapMs) },
              { label: 'Highest vs horizon', value: `${earth.summary.maxMargin.toFixed(1)}°` },
            ]}
          />
        </section>

        <section className="panel" aria-label="Sky at a chosen moment">
          <h3 className="panel__title">Sky at {formatUtc(atMs)}</h3>
          <input
            className="panel__slider"
            type="range"
            min="0"
            max={series.length - 1}
            value={index}
            onChange={(e) => setCursor(Number(e.target.value))}
            aria-label="Moment in the period"
          />
          <SkyView
            profile={profile}
            sun={{ az: point.sunAz, el: point.sunEl }}
            earth={{ az: point.earthAz, el: point.earthEl }}
            yMax={yMax}
          />
          <p className="panel__detail">
            Sun: azimuth {point.sunAz.toFixed(0)}°, elevation {point.sunEl.toFixed(1)}° (terrain horizon{' '}
            {horizonAt(profile, point.sunAz).toFixed(1)}° in that direction). Earth: azimuth {point.earthAz.toFixed(0)}°,
            elevation {point.earthEl.toFixed(1)}° (terrain horizon {horizonAt(profile, point.earthAz).toFixed(1)}°).
          </p>
        </section>

        <section className="panel" aria-label="Visibility over time">
          <h3 className="panel__title">Elevation above the required minimum</h3>
          <ElevationChart tone="sun" title="Sun" samples={sun.samples} windows={sun.windows} cursorMs={atMs} />
          <ElevationChart tone="earth" title="Earth" samples={earth.samples} windows={earth.windows} cursorMs={atMs} />
        </section>
      </>
    )
  }

  return (
    <div className="scenario">
      {!embedded && <SiteControls title={title} sites={southPoleSites} state={state} onChange={update} />}
      {body}
    </div>
  )
}
