import { useMemo, useState } from 'react'
import ElevationChart from './components/ElevationChart.jsx'
import Header from './components/Header.jsx'
import MetricCard from './components/MetricCard.jsx'
import SiteControls from './components/SiteControls.jsx'
import SkyView from './components/SkyView.jsx'
import profilesFile from './data/horizon-profiles.json'
import { southPoleSites } from './data/south-pole-sites.js'
import { formatDuration, formatPercent, formatUtc, todayUtc } from './lib/format.js'
import { useEphemeris } from './lib/useEphemeris.js'
import { findWindows, horizonAt, marginSeries, stateAt, summarize } from './lib/visibility.js'

function statusLine(state, subject) {
  const head = `${subject} ${state.visible ? 'above' : 'below'} the horizon`
  const tail =
    state.remainingMs === null
      ? 'no change before the end of the period'
      : `${state.visible ? 'sets' : 'rises'} in ${formatDuration(state.remainingMs)}`
  return `${head} · ${tail}`
}

function analyze(series, body, profile) {
  const samples = marginSeries(series, body, profile)
  const windows = findWindows(samples)
  return { samples, windows, summary: summarize(samples, windows) }
}

export default function App() {
  const [siteId, setSiteId] = useState(southPoleSites[0].id)
  const [start, setStart] = useState(todayUtc())
  const [days, setDays] = useState(30)
  const [cursor, setCursor] = useState(0)

  const site = southPoleSites.find((s) => s.id === siteId)
  const profile = profilesFile.profiles[site.id]
  const { data, error, loading } = useEphemeris(site, start, days)

  const analysis = useMemo(() => {
    if (!data) return null
    return { sun: analyze(data.series, 'sun', profile), earth: analyze(data.series, 'earth', profile) }
  }, [data, profile])

  const reset = (setter) => (value) => {
    setter(value)
    setCursor(0)
  }

  let body
  if (error) {
    body = <p className="notice notice--error">Could not load the data: {error}</p>
  } else if (loading || !analysis) {
    body = <p className="notice">Loading Sun and Earth positions from NASA JPL Horizons…</p>
  } else {
    const series = data.series
    const index = Math.min(cursor, series.length - 1)
    const point = series[index]
    const atMs = Date.parse(point.t)
    const sunState = stateAt(analysis.sun.samples, analysis.sun.windows, atMs)
    const earthState = stateAt(analysis.earth.samples, analysis.earth.windows, atMs)
    const yMax = Math.max(
      10,
      Math.max(...profile) + 4,
      Math.max(...series.map((p) => p.sunEl)) + 2,
      Math.max(...series.map((p) => p.earthEl)) + 2,
    )
    const sunSummary = analysis.sun.summary
    const earthSummary = analysis.earth.summary

    body = (
      <>
        <section className="metrics" aria-label="Key figures">
          <MetricCard
            tone="sun"
            title="Power (Sun)"
            subtitle="Solar panels need the Sun above the local horizon."
            status={statusLine(sunState, 'Sun')}
            visible={sunState.visible}
            stats={[
              { label: 'Sunlit', value: formatPercent(sunSummary.visibleFraction) },
              { label: 'Longest darkness', value: formatDuration(sunSummary.longestGapMs) },
              { label: 'Highest vs horizon', value: `${sunSummary.maxMargin.toFixed(1)}°` },
            ]}
          />
          <MetricCard
            tone="earth"
            title="Communication (Earth)"
            subtitle="Direct-to-Earth link needs Earth above the local horizon."
            status={statusLine(earthState, 'Earth')}
            visible={earthState.visible}
            stats={[
              { label: 'Earth visible', value: formatPercent(earthSummary.visibleFraction) },
              { label: 'Longest outage', value: formatDuration(earthSummary.longestGapMs) },
              { label: 'Highest vs horizon', value: `${earthSummary.maxMargin.toFixed(1)}°` },
            ]}
          />
        </section>

        <section className="panel" aria-label="Sky at a chosen moment">
          <h2 className="panel__title">Sky at {formatUtc(atMs)}</h2>
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
            {horizonAt(profile, point.sunAz).toFixed(1)}° in that direction). Earth: azimuth{' '}
            {point.earthAz.toFixed(0)}°, elevation {point.earthEl.toFixed(1)}° (terrain horizon{' '}
            {horizonAt(profile, point.earthAz).toFixed(1)}°).
          </p>
        </section>

        <section className="panel" aria-label="Visibility over time">
          <h2 className="panel__title">Elevation above the local horizon over the period</h2>
          <ElevationChart tone="sun" title="Sun" samples={analysis.sun.samples} windows={analysis.sun.windows} cursorMs={atMs} />
          <ElevationChart
            tone="earth"
            title="Earth"
            samples={analysis.earth.samples}
            windows={analysis.earth.windows}
            cursorMs={atMs}
          />
        </section>
      </>
    )
  }

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <SiteControls
          sites={southPoleSites}
          siteId={siteId}
          onSiteChange={reset(setSiteId)}
          start={start}
          onStartChange={reset(setStart)}
          days={days}
          onDaysChange={reset(setDays)}
        />
        {body}
        <p className="app__note">
          Sun and Earth positions: NASA JPL Horizons. Terrain horizon: LOLA elevation map (80 m per pixel). Sun and
          Earth are treated as points, so partial sunrises and sunsets are not modeled yet. Demo sites: coordinates
          to be replaced with official ones.
        </p>
      </main>
    </div>
  )
}
