import { lazy, Suspense, useMemo, useState } from 'react'
import ComparisonTable from './components/ComparisonTable.jsx'
import LayerToggles from './components/LayerToggles.jsx'
import MissionHistory from './components/MissionHistory.jsx'
import RequirementsPanel from './components/RequirementsPanel.jsx'
import ScenarioPanel from './components/ScenarioPanel.jsx'
import ScoreBar from './components/ScoreBar.jsx'
import Shell from './components/Shell.jsx'
import SiteControls from './components/SiteControls.jsx'
import SitesOverview from './components/SitesOverview.jsx'
import TimelineBar from './components/TimelineBar.jsx'
import Verdict from './components/Verdict.jsx'
import Why from './components/Why.jsx'
import { southPoleSites } from './data/south-pole-sites.js'
import { addDaysIso, addMinutesIso, formatUtc, showDateTime, todayUtc } from './lib/format.js'
import { evaluateFromMoment } from './lib/momentScores.js'
import { compareScenarios } from './lib/scenario.js'
import { useScenario } from './lib/useScenario.js'
import { useSitesOverview } from './lib/useSitesOverview.js'
import { useTimeline } from './lib/useTimeline.js'
import { DEFAULT_REQUIREMENTS, evaluateScenario } from './lib/verdict.js'

// The 3D library and data are only downloaded when a 3D tab is shown.
const Terrain3D = lazy(() => import('./components/Terrain3D.jsx'))
const PolarSky = lazy(() => import('./components/PolarSky.jsx'))

const DELAY_DAYS = 2 // default "what if the landing slips" scenario B
const SHIFT_MARGIN_MIN = 15 // land a little after a window opens, not exactly on its edge

// The pitch demo: a site and a date where a day of delay changes the whole verdict (checked on 2026-11-14 with the default
// requirements: landing at 14 Nov 00:00 gives a window score of 0 and a global score of 58; landing at 15 Nov 06:00 gives 100 and 83).
const DEMO = { siteId: 'malapert-massif', start: '2026-11-14T00:00', days: 30 }

// Each tab key also names its icon in components/Icon.jsx.
const TABS = [
  { key: 'sky', label: 'Polar sky', hint: 'The curved south pole with the Sun and the Earth in the sky' },
  { key: 'terrain', label: 'Terrain', hint: 'The south polar map in relief, with the layers' },
  { key: 'why', label: 'Why', hint: 'Why the Sun and the Earth are visible or hidden at this moment' },
  { key: 'analysis', label: 'Analysis', hint: 'Scenario analysis and A/B comparison' },
  { key: 'sites', label: 'Sites', hint: 'All sites on the map and ranked by score' },
]

function evaluate(result, requirements) {
  if (!result.analysis) return null
  return evaluateScenario(result.analysis, requirements, Date.parse(result.data.series[0].t), result.terrain)
}

export default function App() {
  const [tab, setTab] = useState('sky')
  const [layers, setLayers] = useState({ sun: true, earth: true, slope: true })
  const [compare, setCompare] = useState(false)
  const [requirements, setRequirements] = useState(DEFAULT_REQUIREMENTS)
  const [a, setA] = useState({ siteId: southPoleSites[0].id, start: `${todayUtc()}T00:00`, days: 30 })
  const [b, setB] = useState(null)
  const [follow, setFollow] = useState(false) // scores follow the moment of the timeline
  const [mapTarget, setMapTarget] = useState('A') // which scenario a click on the map or the ranking sets

  const overview = useSitesOverview(a.start, a.days, requirements)
  const timeline = useTimeline(a.start, a.days)

  // Minimum elevations change what counts as "visible", so they feed the analysis itself.
  const resultA = useScenario(a, true, requirements)
  const resultB = useScenario(b ?? a, compare && b !== null, requirements)
  const evalA = evaluate(resultA, requirements)
  const evalB = compare ? evaluate(resultB, requirements) : null

  // "What if we land at this moment?": scores measured from the moment of the timeline onward.
  const atMs = timeline.sample ? Date.parse(timeline.sample.t) : null
  const momentEval = useMemo(
    () => (follow && atMs !== null ? evaluateFromMoment(resultA, requirements, atMs) : null),
    [follow, atMs, resultA, requirements],
  )
  const shownEval = momentEval ?? evalA
  const loadDemo = () => {
    setA(DEMO)
    setFollow(true)
    timeline.setIndex(0)
  }

  const toggleCompare = (on) => {
    setCompare(on)
    // First time: B starts as the same site, DELAY_DAYS later.
    if (on && !b) setB({ ...a, start: addDaysIso(a.start, DELAY_DAYS) })
  }
  const selectSite = (siteId) => {
    if (compare && b && mapTarget === 'B') setB((s) => ({ ...s, siteId }))
    else setA((s) => ({ ...s, siteId }))
  }
  const selected = compare && b ? { A: a.siteId, B: b.siteId } : { A: a.siteId }
  const label = (state, result) => `${result.site.name}, from ${showDateTime(state.start)} UT, ${state.days} days`
  const showTable = compare && evalA && evalB

  const view3d = { items: overview.items, selected, onSelect: selectSite, requirements, timeline, layers }
  let content
  if (tab === 'sky' || tab === 'terrain') {
    const View = tab === 'sky' ? PolarSky : Terrain3D
    content = (
      <>
        <LayerToggles layers={layers} onChange={setLayers} maxSlopeDeg={requirements.maxSlopeDeg} />
        <Suspense fallback={<p className="notice">Loading the 3D view…</p>}>
          <View {...view3d} />
        </Suspense>
      </>
    )
  } else if (tab === 'why') {
    content = <Why result={resultA} requirements={requirements} timeline={timeline} />
  } else if (tab === 'sites') {
    content = (
      <SitesOverview
        items={overview.items}
        loadedCount={overview.loadedCount}
        start={a.start}
        days={a.days}
        selected={selected}
        onSelect={selectSite}
        compare={compare && b !== null}
        target={mapTarget}
        onTargetChange={setMapTarget}
      />
    )
  } else {
    content = (
      <div className="stage__scroll">
        <label className="toggle">
          <input type="checkbox" checked={compare} onChange={(e) => toggleCompare(e.target.checked)} />
          <span>Compare two scenarios (two sites, or one site at two dates)</span>
        </label>
        {showTable && (
          <ComparisonTable
            rows={compareScenarios(resultA.analysis, resultB.analysis)}
            labelA={`A: ${label(a, resultA)}`}
            labelB={`B: ${label(b, resultB)}`}
            evalA={evalA}
            evalB={evalB}
          />
        )}
        <div className={compare ? 'compare-grid' : undefined}>
          <ScenarioPanel title={compare ? 'Scenario A' : undefined} state={a} onChange={setA} result={resultA} evaluation={evalA} embedded={!compare} />
          {compare && b && <ScenarioPanel title="Scenario B" state={b} onChange={setB} result={resultB} evaluation={evalB} />}
        </div>
      </div>
    )
  }

  return (
    <Shell
      tabs={TABS}
      tab={tab}
      onTab={setTab}
      top={
        <>
          <div className="brand">
            <span className="brand__name">MOONWALK</span>
            <span className="brand__sub">Lunar Landing Site Navigator</span>
          </div>
          <div className="topscores">
            <ScoreBar evaluation={shownEval} />
            <label className="toggle topscores__follow">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              <span>
                {momentEval && atMs !== null
                  ? `Scores if we land at ${formatUtc(atMs)} (move the timeline)`
                  : 'Scores follow the timeline: what if we land at the moment shown?'}
              </span>
            </label>
          </div>
        </>
      }
      leftTitle="Landing window and rover"
      left={
        <>
          <button type="button" className="button demo" onClick={loadDemo}>
            Pitch demo: Malapert, 14 Nov 2026
          </button>
          <p className="panel__detail demo__note">
            Loads the scenario and turns on &quot;scores follow the timeline&quot;. Land on 14 Nov 00:00: the window score is 0. Drag the timeline
            to 15 Nov 06:00: the Sun is up, the window is 100 and the global score rises from 58 to 83 (default rover requirements).
          </p>
          <SiteControls title="Landing window" sites={southPoleSites} state={a} onChange={(patch) => setA((s) => ({ ...s, ...patch }))} />
          <RequirementsPanel
            requirements={requirements}
            onChange={(patch) => setRequirements((r) => ({ ...r, ...patch }))}
            onReset={() => setRequirements(DEFAULT_REQUIREMENTS)}
          />
        </>
      }
      rightTitle="Feasibility and mission history"
      right={
        <>
          {shownEval && (
            <Verdict
              evaluation={shownEval}
              onShiftLanding={momentEval ? undefined : (ms) => setA((s) => ({ ...s, start: addMinutesIso(s.start, Math.ceil(ms / 60000) + SHIFT_MARGIN_MIN) }))}
            />
          )}
          <MissionHistory onSelectSite={selectSite} />
          <details className="panel panel__detail">
            <summary>Sources and limits</summary>
            <p>
              Sun and Earth positions: NASA JPL Horizons. Terrain horizon and slopes: LOLA elevation map (80 m per pixel). Sun and
              Earth are treated as points, so partial sunrises and sunsets are not modeled yet. Artemis III site coordinates are
              approximate points: NASA&apos;s official region centers are not in the sources we could open. Rover requirements are
              placeholders to adapt.
            </p>
          </details>
        </>
      }
      bottom={<TimelineBar timeline={timeline} />}
    >
      {content}
    </Shell>
  )
}
