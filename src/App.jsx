import { lazy, Suspense, useMemo, useState } from 'react'
import BestAreas from './components/BestAreas.jsx'
import Icon from './components/Icon.jsx'
import ArtemisRegions from './components/ArtemisRegions.jsx'
import ComparisonTable from './components/ComparisonTable.jsx'
import MissionTab from './components/MissionTab.jsx'
import MissionHistory from './components/MissionHistory.jsx'
import RequirementsPanel from './components/RequirementsPanel.jsx'
import ScenarioPanel from './components/ScenarioPanel.jsx'
import Shell from './components/Shell.jsx'
import SiteControls from './components/SiteControls.jsx'
import SitesOverview from './components/SitesOverview.jsx'
import TimelineBar from './components/TimelineBar.jsx'
import Why from './components/Why.jsx'
import { southPoleSites } from './data/south-pole-sites.js'
import { DEFAULT_MISSION_ID, landerById, missions, roverById, roversFor } from './data/vehicles.js'
import { findBestAreas } from './lib/bestAreas.js'
import { addDaysIso, showDateTime, todayUtc } from './lib/format.js'
import { buildCellFrames } from './lib/illumination.js'
import { requirementsFor } from './lib/missionRequirements.js'
import { evaluateFromMoment } from './lib/momentScores.js'
import { pointSite } from './lib/pointSite.js'
import { compareScenarios } from './lib/scenario.js'
import { nearestIndex } from './lib/timelineTools.js'
import { useTerrain3d } from './lib/useTerrain3d.js'
import { useScenario } from './lib/useScenario.js'
import { useSitesOverview } from './lib/useSitesOverview.js'
import { useTimeline } from './lib/useTimeline.js'
import { evaluateScenario } from './lib/verdict.js'

// The 3D library and data are only downloaded when the sky view is shown.
const PolarSky = lazy(() => import('./components/PolarSky.jsx'))

const DELAY_DAYS = 2 // default "what if the landing slips" scenario B
const SHIFT_MARGIN_MIN = 15 // land a little after a window opens, not exactly on its edge

// The pitch demo: a site and a date where a day of delay changes the whole verdict (checked on 2026-11-14 with the default
// requirements: landing at 14 Nov 00:00 gives a window score of 0 and a global score of 58; landing at 15 Nov 06:00 gives 100 and 83).
const DEMO = { siteId: 'malapert-massif', start: '2026-11-14T00:00', days: 30 }

// Each key also names its icon in components/Icon.jsx.
const TABS = [
  { key: 'sky', label: 'Sky', hint: 'The south pole from orbit or from above, with the Sun and the Earth in the sky' },
  { key: 'site', label: 'On site', hint: 'Stand on the selected site and look at the Sun and the Earth' },
  { key: 'why', label: 'Why', hint: 'Why the Sun and the Earth are visible or hidden at this moment' },
  { key: 'analysis', label: 'Analysis', hint: 'Scenario analysis and A/B comparison' },
  { key: 'sites', label: 'Sites', hint: 'All sites on the map and ranked by score' },
  { key: 'mission', label: 'Mission', hint: 'The lander and rover that set the requirements' },
]
const DRAWERS = [
  // No button in the rail: they open from the top bar (the coordinates chip and the Missions button).
  { key: 'settings', label: 'Settings', hint: 'Site, landing date and rover requirements', rail: false },
  { key: 'missions', label: 'Missions', hint: 'Missions to the south polar region', rail: false },
]

function evaluate(result, requirements) {
  if (!result.analysis) return null
  return evaluateScenario(result.analysis, requirements, Date.parse(result.data.series[0].t), result.terrain)
}

const isoMinutes = (ms) => new Date(ms).toISOString().slice(0, 16)

export default function App() {
  const [tab, setTab] = useState('sky')
  const [skyView, setSkyView] = useState('orbit') // 'globe', 'orbit' or 'top': the cameras of the sky tab
  const [drawer, setDrawer] = useState(null)
  const [layers, setLayers] = useState({ sun: true, earth: true, slope: true, go: false, goPeriod: false, feasible: false, psr: false, rock: false })
  const [compare, setCompare] = useState(false)
  // The mission (a lander, with a rover or not) sets the requirements; values typed in Settings override single ones.
  const [mission, setMission] = useState(() => {
    const m = missions.find((x) => x.id === DEFAULT_MISSION_ID)
    return { landerId: m.landerId, roverId: m.roverId }
  })
  const [overrides, setOverrides] = useState({})
  const requirements = useMemo(
    () => ({ ...requirementsFor(landerById(mission.landerId), roverById(mission.roverId)).requirements, ...overrides }),
    [mission, overrides],
  )
  const changeMission = (patch) => {
    setMission((current) => {
      const next = { ...current, ...patch }
      // A rover goes only with a lander that can carry it.
      if (next.roverId && !roversFor(next.landerId).some((r) => r.id === next.roverId)) next.roverId = null
      return next
    })
    setOverrides({}) // a new mission brings its own numbers
  }
  const [a, setA] = useState({ siteId: southPoleSites[0].id, start: `${todayUtc()}T00:00`, days: 30 })
  const [b, setB] = useState(null)
  const [custom, setCustom] = useState(null) // a point selected on the map, analyzed like a site (pointSite.js)
  const [mapTarget, setMapTarget] = useState('A') // which scenario a click on the map or the ranking sets

  const overview = useSitesOverview(a.start, a.days, requirements)
  const timeline = useTimeline(a.start, a.days)
  // The relief data and the cell frames are loaded here, for the sky view and for the best landing areas (a menu of the top bar, in every tab).
  const terrainData = useTerrain3d()
  const frames = useMemo(() => (terrainData.terrain ? buildCellFrames(terrainData.terrain) : null), [terrainData.terrain])

  // Minimum elevations change what counts as "visible", so they feed the analysis itself.
  const resultA = useScenario(a, true, requirements, custom)
  const resultB = useScenario(b ?? a, compare && b !== null, requirements, custom)
  // Memoized: the sky views re-render at every step of the timeline, the evaluation of the whole period does not change then.
  const evalA = useMemo(() => evaluate(resultA, requirements), [resultA, requirements])
  const evalB = useMemo(() => (compare ? evaluate(resultB, requirements) : null), [compare, resultB, requirements])

  // "What if we land at this moment?": the scores of the sky view are measured from the moment of the timeline onward.
  const atMs = timeline.sample ? Date.parse(timeline.sample.t) : null
  const momentEval = useMemo(
    () => (atMs !== null ? evaluateFromMoment(resultA, requirements, atMs) : null),
    [atMs, resultA, requirements],
  )
  const shownEval = momentEval ?? evalA
  const startMs = Date.parse(`${a.start}:00Z`)

  // Best landing areas: found for the period and the requirements (a second or two), kept until one of them changes.
  const areasKey = `${a.start}|${a.days}|${JSON.stringify(requirements)}`
  const [found, setFound] = useState({ key: null, list: null })
  const [searching, setSearching] = useState(false)
  const [flyTarget, setFlyTarget] = useState(null) // { lat, lon, n }: a request to the sky view to fly the camera to an area
  const areas = found.key === areasKey ? found.list : null
  const searchAreas = () => {
    if (!terrainData.terrain || !frames || !timeline.samples) return
    setSearching(true)
    setTimeout(() => {
      setFound({ key: areasKey, list: findBestAreas(terrainData.terrain, frames, timeline.samples, requirements) })
      setSearching(false)
    }, 30)
  }
  // Picking an area selects that place and puts the timeline on its best landing moment, so the scores of the Sky card, the Analysis tab
  // and the list are the same. The camera flies there when the sky view is open.
  const pickArea = (area) => {
    const point = pointSite(area.lat, area.lon, { terrain: terrainData.terrain })
    if (point) {
      setCustom(point)
      setA((s) => ({ ...s, siteId: point.id }))
    }
    if (timeline.samples) timeline.setIndex(nearestIndex(timeline.samples, area.landingMs))
    setFlyTarget({ lat: area.lat, lon: area.lon, n: Date.now() })
  }
  const landAt = (ms) => {
    setA((s) => ({ ...s, start: isoMinutes(ms) }))
    timeline.setIndex(0)
  }
  const loadDemo = () => {
    setA(DEMO)
    timeline.setIndex(0)
    setTab('sky')
    setDrawer(null)
  }

  // A click on the ground of the 3D view: that place becomes the site of scenario A, analyzed over the whole period.
  const selectPoint = (point) => {
    setCustom(point)
    setA((s) => ({ ...s, siteId: point.id }))
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
  const siteA = custom && custom.id === a.siteId ? custom : southPoleSites.find((s) => s.id === a.siteId)
  const selected = compare && b ? { A: a.siteId, B: b.siteId } : { A: a.siteId }
  const label = (state, result) => `${result.site.name}, from ${showDateTime(state.start)} UT, ${state.days} days`
  const showTable = compare && evalA && evalB

  let content
  if (tab === 'sky' || tab === 'site') {
    // The same element for both tabs, so the scene stays alive and the camera can fly between views.
    content = (
      <Suspense fallback={<p className="notice">Loading the 3D view…</p>}>
        <PolarSky
          terrainData={terrainData}
          frames={frames}
          areas={areas}
          flyTarget={flyTarget}
          items={overview.items}
          selected={selected}
          onSelect={selectSite}
          siteA={siteA}
          onPickPoint={selectPoint}
          requirements={requirements}
          timeline={timeline}
          layers={layers}
          onLayers={setLayers}
          view={tab === 'site' ? 'site' : skyView}
          onView={setSkyView}
          evaluation={shownEval}
          startMs={startMs}
          onLand={() => atMs !== null && landAt(atMs)}
          onShiftLanding={(ms) => atMs !== null && landAt(atMs + ms + SHIFT_MARGIN_MIN * 60000)}
        />
      </Suspense>
    )
  } else if (tab === 'why') {
    content = <Why result={resultA} requirements={requirements} timeline={timeline} />
  } else if (tab === 'mission') {
    content = <MissionTab mission={mission} onMission={changeMission} requirements={requirements} overrides={overrides} onResetOverrides={() => setOverrides({})} />
  } else if (tab === 'sites') {
    content = (
      <div className="stage__scroll">
        <ArtemisRegions onSelect={selectSite} />
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
      </div>
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
          <ScenarioPanel
            title={compare ? 'Scenario A' : undefined}
            state={a}
            onChange={setA}
            result={resultA}
            evaluation={compare ? evalA : shownEval}
            momentMs={atMs}
            landingNote={!compare && momentEval !== null}
            embedded={!compare}
            custom={custom}
          />
          {compare && b && (
            <ScenarioPanel
              title="Scenario B"
              state={b}
              onChange={setB}
              result={resultB}
              evaluation={evalB}
              momentMs={atMs !== null ? Date.parse(`${b.start}:00Z`) + (atMs - startMs) : null}
            />
          )}
        </div>
      </div>
    )
  }

  let drawerContent = null
  if (drawer === 'settings') {
    drawerContent = (
      <>
        <button type="button" className="button demo" onClick={loadDemo}>
          Pitch demo: Malapert, 14 Nov 2026
        </button>
        <p className="panel__detail demo__note">
          Land on 14 Nov 00:00: the window score is 0. Drag the timeline to 15 Nov 06:00: the Sun is up, the window is 100 and the global
          score rises from 58 to 83 (default rover requirements).
        </p>
        <SiteControls title="Landing window" sites={southPoleSites} state={a} onChange={(patch) => setA((s) => ({ ...s, ...patch }))} custom={custom} />
        <details className="fold">
          <summary>
            Rover requirements
            <span className="fold__hint">
              slope {requirements.maxSlopeDeg}° · battery {requirements.batteryHours} h · link {requirements.linkMinPerHour} min/h
            </span>
          </summary>
          <RequirementsPanel
            requirements={requirements}
            onChange={(patch) => setOverrides((o) => ({ ...o, ...patch }))}
            onReset={() => setOverrides({})}
          />
        </details>
      </>
    )
  } else if (drawer === 'missions') {
    drawerContent = (
      <>
        <MissionHistory
          onSelectSite={(id) => {
            selectSite(id)
            setDrawer(null)
          }}
        />
        <details className="fold">
          <summary>Sources and limits</summary>
          <p className="panel__detail">
            Sun and Earth positions: NASA JPL Horizons. Terrain horizon and slopes: LOLA elevation map (80 m per pixel). Sun and Earth
            are treated as points, so partial sunrises and sunsets are not modeled yet. Artemis III site coordinates are approximate
            points: NASA&apos;s official region centers are not in the sources we could open. Rover requirements are placeholders to
            adapt.
          </p>
        </details>
      </>
    )
  }

  const site = siteA
  return (
    <Shell
      tabs={TABS}
      tab={tab}
      onTab={setTab}
      drawers={DRAWERS}
      drawer={drawer}
      onDrawer={setDrawer}
      drawerContent={drawerContent}
      top={
        <>
          <div className="brand">
            <img className="brand__logo" src="/moonwalk-logo.svg" alt="Moonwalk" />
          </div>
          <button type="button" className="chip" onClick={() => setDrawer(drawer === 'missions' ? null : 'missions')} title="Missions to the south polar region">
            <Icon className="chip__icon" name="missions" />
            <strong>Missions</strong>
          </button>
          <button type="button" className="chip" onClick={() => setDrawer(drawer === 'settings' ? null : 'settings')} title="Change the site, the date or the rover requirements">
            <Icon className="chip__icon" name="gear" />
            <strong>{site.shortName}</strong>
            <span>
              {showDateTime(a.start)} UT · {a.days} days
            </span>
          </button>
          <BestAreas
            areas={areas}
            searching={searching}
            ready={!!(terrainData.terrain && frames && timeline.samples)}
            onSearch={searchAreas}
            onPick={pickArea}
            sites={southPoleSites}
          />
        </>
      }
      bottom={<TimelineBar timeline={timeline} />}
    >
      {content}
    </Shell>
  )
}
