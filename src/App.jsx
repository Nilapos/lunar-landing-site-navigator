import { useState } from 'react'
import ComparisonTable from './components/ComparisonTable.jsx'
import Header from './components/Header.jsx'
import MissionHistory from './components/MissionHistory.jsx'
import RequirementsPanel from './components/RequirementsPanel.jsx'
import ScenarioPanel from './components/ScenarioPanel.jsx'
import SitesOverview from './components/SitesOverview.jsx'
import View3DPanel from './components/View3DPanel.jsx'
import { southPoleSites } from './data/south-pole-sites.js'
import { addDaysIso, showDateTime, todayUtc } from './lib/format.js'
import { compareScenarios } from './lib/scenario.js'
import { useScenario } from './lib/useScenario.js'
import { useSitesOverview } from './lib/useSitesOverview.js'
import { DEFAULT_REQUIREMENTS, evaluateScenario } from './lib/verdict.js'

const DELAY_DAYS = 2 // default "what if the landing slips" scenario B

function evaluate(result, requirements) {
  if (!result.analysis) return null
  return evaluateScenario(result.analysis, requirements, Date.parse(result.data.series[0].t), result.terrain)
}

export default function App() {
  const [compare, setCompare] = useState(false)
  const [requirements, setRequirements] = useState(DEFAULT_REQUIREMENTS)
  const [a, setA] = useState({ siteId: southPoleSites[0].id, start: `${todayUtc()}T00:00`, days: 30 })
  const [b, setB] = useState(null)
  const [mapTarget, setMapTarget] = useState('A') // which scenario a click on the map or the ranking sets

  const overview = useSitesOverview(a.start, a.days, requirements)

  // Minimum elevations change what counts as "visible", so they feed the analysis itself.
  const resultA = useScenario(a, true, requirements)
  const resultB = useScenario(b ?? a, compare && b !== null, requirements)
  const evalA = evaluate(resultA, requirements)
  const evalB = compare ? evaluate(resultB, requirements) : null

  const toggleCompare = (on) => {
    setCompare(on)
    // First time: B starts as the same site, DELAY_DAYS later.
    if (on && !b) setB({ ...a, start: addDaysIso(a.start, DELAY_DAYS) })
  }

  const selectSite = (siteId) => {
    if (compare && b && mapTarget === 'B') setB((s) => ({ ...s, siteId }))
    else setA((s) => ({ ...s, siteId }))
  }

  const label = (state, result) => `${result.site.name}, from ${showDateTime(state.start)} UT, ${state.days} days`
  const showTable = compare && evalA && evalB

  return (
    <div className="app">
      <Header />
      <main className={`app__main${compare ? ' app__main--wide' : ''}`}>
        <RequirementsPanel
          requirements={requirements}
          onChange={(patch) => setRequirements((r) => ({ ...r, ...patch }))}
          onReset={() => setRequirements(DEFAULT_REQUIREMENTS)}
        />

        <label className="toggle">
          <input type="checkbox" checked={compare} onChange={(e) => toggleCompare(e.target.checked)} />
          <span>Compare two scenarios (two sites, or one site at two dates)</span>
        </label>

        <SitesOverview
          items={overview.items}
          loadedCount={overview.loadedCount}
          start={a.start}
          days={a.days}
          selected={compare && b ? { A: a.siteId, B: b.siteId } : { A: a.siteId }}
          onSelect={selectSite}
          compare={compare && b !== null}
          target={mapTarget}
          onTargetChange={setMapTarget}
        />

        <View3DPanel
          items={overview.items}
          selected={compare && b ? { A: a.siteId, B: b.siteId } : { A: a.siteId }}
          onSelect={selectSite}
          maxSlopeDeg={requirements.maxSlopeDeg}
        />

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
            evaluation={evalA}
          />
          {compare && b && (
            <ScenarioPanel title="Scenario B" state={b} onChange={setB} result={resultB} evaluation={evalB} />
          )}
        </div>

        <MissionHistory onSelectSite={selectSite} />

        <p className="app__note">
          Sun and Earth positions: NASA JPL Horizons. Terrain horizon and slopes: LOLA elevation map (80 m per pixel).
          Sun and Earth are treated as points, so partial sunrises and sunsets are not modeled yet. Artemis III site
          coordinates are approximate points: NASA's official region centers are not in the sources we could open.
          Rover requirements are placeholders to adapt.
        </p>
      </main>
    </div>
  )
}
