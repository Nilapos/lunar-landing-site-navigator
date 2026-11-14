import { lazy, Suspense, useState } from 'react'
import { formatUtc } from '../lib/format.js'
import { useTimeline } from '../lib/useTimeline.js'

// The 3D library and data are only downloaded when the user asks for the 3D view.
const Terrain3D = lazy(() => import('./Terrain3D.jsx'))
const PolarSky = lazy(() => import('./PolarSky.jsx'))

const MODES = [
  { key: 'terrain', label: 'Terrain' },
  { key: 'sky', label: 'Polar sky' },
]

// Two 3D views of the south pole that share one moment (timeline) and the same ground layers:
// "Terrain" (the map in relief) and "Polar sky" (the curved cap with the Sun and the Earth in the sky).
export default function View3DPanel({ items, selected, onSelect, requirements, start, days }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('sky')
  const [layers, setLayers] = useState({ sun: true, earth: true, slope: true })
  const [webgl] = useState(() => !!document.createElement('canvas').getContext('webgl2'))
  const timeline = useTimeline(start, days, open)
  const { samples, index, sky } = timeline
  const toggleLayer = (key) => (e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))
  const View = mode === 'sky' ? PolarSky : Terrain3D

  return (
    <section className="panel" aria-label="3D view of the south pole">
      <div className="requirements__head">
        <h2 className="panel__title">3D view of the south pole</h2>
        {!open && (
          <button type="button" className="button" onClick={() => setOpen(true)}>
            Open the 3D view (loads about 2 MB of 3D library and data)
          </button>
        )}
        {open && (
          <div className="tabs" role="group" aria-label="3D view">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`tabs__tab${mode === m.key ? ' tabs__tab--active' : ''}`}
                aria-pressed={mode === m.key}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {open && !webgl && <p className="notice notice--error">3D needs WebGL, which this browser does not provide.</p>}
      {open && webgl && (
        <div className="view3d">
          <div className="view3d__controls">
            <label className="toggle">
              <input type="checkbox" checked={layers.sun} onChange={toggleLayer('sun')} />
              <span>Sunlight and shadows</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={layers.earth} onChange={toggleLayer('earth')} />
              <span>Earth visible (direct link)</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={layers.slope} onChange={toggleLayer('slope')} />
              <span>Forbidden zones (slope above {requirements.maxSlopeDeg}°)</span>
            </label>
          </div>

          <div className="view3d__time">
            <button type="button" className="button" disabled={!samples} onClick={timeline.togglePlay}>
              {timeline.playing ? 'Pause' : 'Play'}
            </button>
            <input
              className="panel__slider"
              type="range"
              min="0"
              max={samples ? samples.length - 1 : 0}
              value={index}
              disabled={!samples}
              onChange={(e) => timeline.setIndex(Number(e.target.value))}
              aria-label="Moment shown in the 3D views"
            />
            <span className="view3d__clock">
              {samples ? formatUtc(Date.parse(samples[index].t)) : sky.error ? `Sky data: ${sky.error}` : 'Loading the Sun and Earth positions…'}
            </span>
          </div>

          <Suspense fallback={<p className="notice">Loading the 3D view…</p>}>
            <View items={items} selected={selected} onSelect={onSelect} requirements={requirements} timeline={timeline} layers={layers} />
          </Suspense>

          <p className="view3d__legend">
            <span className="swatch swatch--sun" /> sunlit <span className="swatch swatch--shadow" /> in shadow{' '}
            <span className="swatch swatch--earth" /> Earth above the horizon <span className="swatch swatch--slope" /> too steep for the rover
          </p>
        </div>
      )}
    </section>
  )
}
