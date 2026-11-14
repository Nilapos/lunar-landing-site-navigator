import { useEffect, useMemo, useRef, useState } from 'react'
import horizonFile from '../data/horizon-profiles.json'
import { probeCell } from '../lib/cellProbe.js'
import { formatPercent, formatUtc } from '../lib/format.js'
import { paintGround } from '../lib/groundTexture.js'
import { buildCellFrames } from '../lib/illumination.js'
import { causeText, siteBodyStates } from '../lib/polarSky.js'
import { createPolarSkyScene } from '../lib/polarSkyScene.js'
import { sitePins, useTerrain3d } from '../lib/useTerrain3d.js'
import { LEVEL_LABEL } from '../lib/verdict.js'

const signed = (deg) => `${deg >= 0 ? '+' : '−'}${Math.abs(deg).toFixed(1)}°`

// One line of the verdict overlay: a body, visible (green) or hidden (red), with the cause in words.
function BodyLine({ name, state }) {
  return (
    <p className={`skycard__line skycard__line--${state.visible ? 'ok' : 'fail'}`}>
      <span className="skycard__dot" aria-hidden="true" />
      {causeText(name, state)}
    </p>
  )
}

// The hover card: "is this cell a good landing zone?"
function ProbeCard({ probe, pinned, onClose, maxSlopeDeg }) {
  const now = (label, s) => `${label} ${s.margin > 0 ? 'visible' : 'hidden'} now (${signed(s.el)}, horizon ${signed(s.horizon)})`
  return (
    <div className="skycard skycard--probe">
      <p className="skycard__title">
        <span className={`skycard__badge skycard__badge--${probe.level}`}>
          {LEVEL_LABEL[probe.level]} {probe.score}/100
        </span>
        {pinned ? (
          <button type="button" className="button button--small" onClick={onClose}>
            Unpin
          </button>
        ) : (
          <span className="skycard__hint">click to pin</span>
        )}
      </p>
      <p className="skycard__reason">{probe.reason}</p>
      <ul className="skycard__list">
        <li>
          Slope {probe.slopeDeg}° (rover limit {maxSlopeDeg}°)
        </li>
        <li>{now('Sun', probe.now.sun)}</li>
        <li>{now('Earth', probe.now.earth)}</li>
        <li>
          Over the period: Sun {formatPercent(probe.fractions.sun)}, Earth {formatPercent(probe.fractions.earth)}, both{' '}
          {formatPercent(probe.fractions.both)}
        </li>
      </ul>
      <p className="skycard__hint">2.4 km cell: an overview that can differ from the site analysis on summits and slopes.</p>
    </div>
  )
}

// "Polar sky": the south polar cap on the curved Moon, with the Sun and the Earth moving in the sky with the
// shared timeline, and the same ground layers as the Terrain view. It shows why a place has sunlight or a
// direct link to Earth. Props as Terrain3D.
export default function PolarSky({ items, selected, onSelect, requirements, timeline, layers }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const { terrain, hillshade, error } = useTerrain3d()
  const [exaggeration, setExaggeration] = useState(2)
  const [hoverCell, setHoverCell] = useState(null)
  const [pinnedCell, setPinnedCell] = useState(null)
  const [standing, setStanding] = useState(false) // camera on the site (true) or in orbit (false)
  const frames = useMemo(() => (terrain ? buildCellFrames(terrain) : null), [terrain])
  const { sample, samples, index, playing } = timeline

  // The site of scenario A: the lines and the verdict overlay are about it.
  const site = items.find((i) => i.site.id === selected.A)?.site ?? null
  const states = useMemo(
    () => (site && sample ? siteBodyStates(site, sample, horizonFile.profiles[site.id], requirements) : null),
    [site, sample, requirements],
  )

  const shownCell = standing ? null : (pinnedCell ?? hoverCell)
  const probe = useMemo(
    () => (shownCell !== null && terrain && frames && samples ? probeCell(terrain, frames, shownCell, samples, index, requirements) : null),
    [shownCell, terrain, frames, samples, index, requirements],
  )

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!terrain || !hillshade || !containerRef.current) return undefined
    const scene = createPolarSkyScene(containerRef.current, terrain, {
      onPick: (id) => onSelectRef.current(id),
      onProbe: setHoverCell,
      onPin: (cell) => setPinnedCell((current) => (current === cell ? null : cell)),
    })
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [terrain, hillshade])

  // Same ground painting as the Terrain view: the zones on the surface follow the Sun and the Earth in the sky.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !terrain || !hillshade) return
    paintGround(scene.textureCanvas, { hillshade, terrain, frames, sample, layers, requirements })
    scene.refreshTexture()
  }, [terrain, hillshade, frames, sample, layers, requirements])

  useEffect(() => {
    sceneRef.current?.setExaggeration(exaggeration)
  }, [terrain, hillshade, exaggeration])

  useEffect(() => {
    sceneRef.current?.setSites(sitePins(items, selected))
  }, [terrain, hillshade, items, selected])

  useEffect(() => {
    sceneRef.current?.setSample(sample)
  }, [terrain, hillshade, sample])

  useEffect(() => {
    sceneRef.current?.setFocus(
      site && states ? { lat: site.lat, lon: site.lon, sunVisible: states.sun.visible, earthVisible: states.earth.visible } : null,
    )
  }, [terrain, hillshade, site, states])

  useEffect(() => {
    const profile = site && horizonFile.profiles[site.id]
    sceneRef.current?.setView(standing && profile ? { lat: site.lat, lon: site.lon, profile } : null)
  }, [terrain, hillshade, standing, site])

  useEffect(() => {
    sceneRef.current?.setReticle(probe ? shownCell : null)
  }, [terrain, hillshade, probe, shownCell])

  if (error) return <p className="notice notice--error">{error}</p>
  return (
    <div className="view3d view3d--fill">
      <div className="view3d__controls">
        <div className="tabs" role="group" aria-label="Camera">
          <button type="button" className={`tabs__tab${standing ? '' : ' tabs__tab--active'}`} aria-pressed={!standing} onClick={() => setStanding(false)}>
            Orbit
          </button>
          <button
            type="button"
            className={`tabs__tab${standing ? ' tabs__tab--active' : ''}`}
            aria-pressed={standing}
            disabled={!site}
            onClick={() => setStanding(true)}
          >
            On the site{site ? `: ${site.shortName}` : ''}
          </button>
        </div>
        {standing && (
          <>
            <button type="button" className="button" onClick={() => sceneRef.current?.lookAt('sun')}>
              Look at the Sun
            </button>
            <button type="button" className="button" onClick={() => sceneRef.current?.lookAt('earth')}>
              Look at the Earth
            </button>
          </>
        )}
        {!standing && (
        <label className="view3d__slider">
          <span className="controls__label">Relief x{exaggeration}</span>
          <input type="range" min="1" max="4" step="1" value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} />
        </label>
        )}
        <button type="button" className="button" onClick={() => sceneRef.current?.resetView()}>
          Reset view
        </button>
      </div>

      <div className="view3d__canvas view3d__canvas--sky" ref={containerRef}>
        {!(terrain && hillshade) && <p className="notice view3d__loading">Loading the 3D relief…</p>}
        {site && states && (
          // Read aloud when the moment changes by hand, not on every step of the animation.
          <div className="skycard skycard--verdict" aria-live={playing ? 'off' : 'polite'}>
            <p className="skycard__title">
              <span className="skycard__site">{site.shortName}</span>
              <span className="skycard__time">{formatUtc(Date.parse(sample.t))}</span>
            </p>
            <BodyLine name="Sun" state={states.sun} />
            <BodyLine name="Earth" state={states.earth} />
          </div>
        )}
        {probe && (
          <ProbeCard probe={probe} pinned={pinnedCell !== null} onClose={() => setPinnedCell(null)} maxSlopeDeg={requirements.maxSlopeDeg} />
        )}
      </div>

      <details className="panel__detail view3d__about">
        <summary>About this view and its limits</summary>
        <p>
        Sun and Earth: true direction and true angular size (the Sun is 0.53° wide, the Earth 1.9°), from JPL Horizons; surface: LOLA
        map on the real sphere, relief multiplied by the factor above; textures and the Sun&apos;s glare are stylized. Drag to rotate,
        right-drag to move; click the view, then scroll to zoom. The lines go from the site of scenario A to the Sun (yellow) and the
        Earth (blue), faint when the terrain hides the body from that site. Move over the ground to judge a 2.4 km cell, click to pin
        the card; click a pin to analyze that site. The cells are an overview: on summits and slopes near the pole they can differ
        from the precise site analysis, which is the one to use for decisions. &quot;On the site&quot; puts the camera 2 m above the
        site of scenario A: the skyline is that site&apos;s real terrain horizon (LOLA, one value per degree of azimuth), the ground
        below it is a drawing; drag to look around, click then scroll to zoom in on the Sun or the Earth.
        </p>
      </details>
    </div>
  )
}
