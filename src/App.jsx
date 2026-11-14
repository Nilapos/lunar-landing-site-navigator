import { useState } from 'react'
import ComparisonTable from './components/ComparisonTable.jsx'
import Header from './components/Header.jsx'
import ScenarioPanel from './components/ScenarioPanel.jsx'
import { southPoleSites } from './data/south-pole-sites.js'
import { addDaysIso, todayUtc } from './lib/format.js'
import { compareScenarios } from './lib/scenario.js'
import { useScenario } from './lib/useScenario.js'

const DELAY_DAYS = 2 // default "what if the landing slips" scenario B

export default function App() {
  const [compare, setCompare] = useState(false)
  const [a, setA] = useState({ siteId: southPoleSites[0].id, start: todayUtc(), days: 30 })
  const [b, setB] = useState(null)

  const resultA = useScenario(a)
  const resultB = useScenario(b ?? a, compare && b !== null)

  const toggleCompare = (on) => {
    setCompare(on)
    // First time: B starts as the same site, DELAY_DAYS later.
    if (on && !b) setB({ ...a, start: addDaysIso(a.start, DELAY_DAYS) })
  }

  const label = (state, result) => `${result.site.name}, from ${state.start}, ${state.days} days`
  const showTable = compare && resultA.analysis && resultB.analysis

  return (
    <div className="app">
      <Header />
      <main className={`app__main${compare ? ' app__main--wide' : ''}`}>
        <label className="toggle">
          <input type="checkbox" checked={compare} onChange={(e) => toggleCompare(e.target.checked)} />
          <span>Compare two scenarios (two sites, or one site at two dates)</span>
        </label>

        {showTable && (
          <ComparisonTable
            rows={compareScenarios(resultA.analysis, resultB.analysis)}
            labelA={`A: ${label(a, resultA)}`}
            labelB={`B: ${label(b, resultB)}`}
          />
        )}

        <div className={compare ? 'compare-grid' : undefined}>
          <ScenarioPanel title={compare ? 'Scenario A' : undefined} state={a} onChange={setA} result={resultA} />
          {compare && b && <ScenarioPanel title="Scenario B" state={b} onChange={setB} result={resultB} />}
        </div>

        <p className="app__note">
          Sun and Earth positions: NASA JPL Horizons. Terrain horizon: LOLA elevation map (80 m per pixel). Sun and
          Earth are treated as points, so partial sunrises and sunsets are not modeled yet. Demo sites: coordinates
          to be replaced with official ones.
        </p>
      </main>
    </div>
  )
}
