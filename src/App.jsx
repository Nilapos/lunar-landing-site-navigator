import { useState } from 'react'
import Header from './components/Header.jsx'
import MapPanel from './components/MapPanel.jsx'
import SiteList from './components/SiteList.jsx'
import { candidateSites } from './data/sites.js'
import { scoreSite } from './lib/scoring.js'

export default function App() {
  const [selectedId, setSelectedId] = useState(null)

  // Logic (Quentin): ranking of candidate sites. UI (Teo): how it is shown.
  const ranked = candidateSites
    .map((site) => ({ ...site, score: scoreSite(site) }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        <MapPanel sites={ranked} selectedId={selectedId} onSelect={setSelectedId} />
        <SiteList sites={ranked} selectedId={selectedId} onSelect={setSelectedId} />
      </main>
    </div>
  )
}
