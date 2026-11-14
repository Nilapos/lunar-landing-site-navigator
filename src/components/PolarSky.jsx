import { useEffect, useMemo, useRef, useState } from 'react'
import horizonFile from '../data/horizon-profiles.json'
import { southPoleSites } from '../data/south-pole-sites.js'
import { findBestAreas } from '../lib/bestAreas.js'
import { probeCell } from '../lib/cellProbe.js'
import { groundOverlayColors } from '../lib/cssTokens.js'
import { formatPercent } from '../lib/format.js'
import { paintGround, paintZone } from '../lib/groundTexture.js'
import { buildCellFrames } from '../lib/illumination.js'
import { siteBodyStates } from '../lib/polarSky.js'
import { createPolarSkyScene } from '../lib/polarSkyScene.js'
import { candidateRegions, sitePins, useTerrain3d } from '../lib/useTerrain3d.js'
import { useZone } from '../lib/useZone.js'
import { zoneFrames, zonePatchRect } from '../lib/zones.js'
import { LEVEL_LABEL } from '../lib/verdict.js'
import BestAreas from './BestAreas.jsx'
import LayerToggles from './LayerToggles.jsx'
import Pop from './Pop.jsx'
import ScoreCard from './ScoreCard.jsx'

// The Artemis III candidate regions, painted on the ground as in NASA's videos.
const REGIONS = candidateRegions(southPoleSites)

const signed = (deg) => `${deg >= 0 ? '+' : '−'}${Math.abs(deg).toFixed(1)}°`

const VIEWS = [
  { key: 'orbit', label: 'Orbit' },
  { key: 'top', label: 'Top view' },
]

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

/**
 * The one 3D view of the south pole: the curved cap with the Sun and the Earth in the sky, the layers painted on the
 * ground (they follow the shared timeline), and three cameras: "orbit" (oblique, over the pole), "top" (straight down,
 * like a map) with an animated flight between them, and "site" (standing on the site of scenario A).
 *   view: 'orbit' | 'top' | 'site';  onView(view): change of camera (orbit / top only);
 *   evaluation, startMs, onLand, onShiftLanding: the score card (see ScoreCard).
 */
export default function PolarSky({ items, selected, onSelect, requirements, timeline, layers, onLayers, view, onView, evaluation, startMs, onLand, onShiftLanding }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const flightRef = useRef(false) // false until the first pose is set: no flight when the view opens
  const { terrain, hillshade, error } = useTerrain3d()
  const [exaggeration, setExaggeration] = useState(2)
  const [hoverCell, setHoverCell] = useState(null)
  const [pinnedCell, setPinnedCell] = useState(null)
  const [areas, setAreas] = useState(null) // best areas found for the period, null before the first search
  const [searching, setSearching] = useState(false)
  const [near, setNear] = useState(false) // the camera is close to the selected site: its fine zone replaces the overview
  const standing = view === 'site'
  const frames = useMemo(() => (terrain ? buildCellFrames(terrain) : null), [terrain])
  const { sample, samples, index, playing } = timeline

  // The site of scenario A: the lines, the score card and the site camera are about it.
  const site = items.find((i) => i.site.id === selected.A)?.site ?? null
  const states = useMemo(
    () => (site && sample ? siteBodyStates(site, sample, horizonFile.profiles[site.id], requirements) : null),
    [site, sample, requirements],
  )

  // Fine zone (100 to 250 m cells) of the selected site, loaded when the camera first comes close.
  const zoneData = useZone(site?.id ?? null, near)
  const zoneGrid = useMemo(() => (zoneData.zone ? zoneFrames(zoneData.zone) : null), [zoneData.zone])
  const zoneShown = near && !standing && !!zoneData.zone && !!zoneData.image

  const shownCell = standing ? null : (pinnedCell ?? hoverCell)
  const probe = useMemo(
    () => (shownCell !== null && terrain && frames && samples ? probeCell(terrain, frames, shownCell, samples, index, requirements) : null),
    [shownCell, terrain, frames, samples, index, requirements],
  )

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Search the best landing areas of the period (a second or two: it judges thousands of cells), then mark them on the map.
  const searchAreas = () => {
    if (!terrain || !frames || !samples) return
    setSearching(true)
    setTimeout(() => {
      const found = findBestAreas(terrain, frames, samples, requirements)
      setAreas(found)
      setSearching(false)
      sceneRef.current?.setRankMarkers(found)
    }, 30)
  }

  useEffect(() => {
    if (!terrain || !hillshade || !containerRef.current) return undefined
    const scene = createPolarSkyScene(containerRef.current, terrain, {
      onPick: (id) => onSelectRef.current(id),
      onProbe: setHoverCell,
      onPin: (cell) => setPinnedCell((current) => (current === cell ? null : cell)),
      onNear: setNear,
    })
    sceneRef.current = scene
    flightRef.current = false
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [terrain, hillshade])

  // The ground follows the Sun and the Earth in the sky.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !terrain || !hillshade) return
    paintGround(scene.textureCanvas, {
      hillshade,
      terrain,
      frames,
      sample,
      samples,
      layers,
      requirements,
      overlay: { regions: REGIONS, colors: groundOverlayColors() },
      holes: zoneShown ? [zonePatchRect(zoneData.zone)] : [],
    })
    scene.refreshTexture()
  }, [terrain, hillshade, frames, sample, samples, layers, requirements, zoneShown, zoneData.zone])

  // The fine zone: its mesh when shown, and its own texture (same layers, computed on its cells).
  useEffect(() => {
    sceneRef.current?.setZone(zoneData.zone, zoneShown)
  }, [terrain, hillshade, zoneData.zone, zoneShown])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !zoneShown) return
    paintZone(scene.zoneCanvas, { hillshade: zoneData.image, zone: zoneData.zone, frames: zoneGrid, sample, samples, layers, requirements })
    scene.refreshZoneTexture()
  }, [zoneShown, zoneData, zoneGrid, sample, samples, layers, requirements])

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

  // Camera: standing on the site, or one of the two orbit poses (the move between them is animated).
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const profile = site && horizonFile.profiles[site.id]
    if (standing && profile) {
      scene.setView({ lat: site.lat, lon: site.lon, profile })
    } else {
      scene.setView(null)
      scene.setOrbitPose(view === 'top' ? 'top' : 'orbit', flightRef.current)
    }
    flightRef.current = true
  }, [terrain, hillshade, standing, view, site])

  useEffect(() => {
    sceneRef.current?.setReticle(probe ? shownCell : null)
  }, [terrain, hillshade, probe, shownCell])

  if (error) return <p className="notice notice--error">{error}</p>
  return (
    <div className="view3d view3d--fill">
      <div className="view3d__canvas view3d__canvas--sky" ref={containerRef}>
        {!(terrain && hillshade) && <p className="notice view3d__loading">Loading the 3D relief…</p>}

        <ScoreCard
          site={site}
          atMs={sample ? Date.parse(sample.t) : null}
          startMs={startMs}
          evaluation={evaluation}
          states={states}
          onLand={onLand}
          onShiftLanding={onShiftLanding}
          live={!playing}
        />

        <div className="viewbar">
          {standing ? (
            <>
              <button type="button" className="button" onClick={() => sceneRef.current?.lookAt('sun')}>
                Sun
              </button>
              <button type="button" className="button" onClick={() => sceneRef.current?.lookAt('earth')}>
                Earth
              </button>
            </>
          ) : (
            <div className="tabs" role="group" aria-label="Camera">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={`tabs__tab${view === v.key ? ' tabs__tab--active' : ''}`}
                  aria-pressed={view === v.key}
                  onClick={() => (view === v.key ? sceneRef.current?.setOrbitPose(v.key) : onView(v.key))}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          {!standing && (
            <button type="button" className="button" title="Fly down to the selected site and show its fine cells" onClick={() => sceneRef.current?.zoomToSite()}>
              Zoom to site
            </button>
          )}
          <LayerToggles layers={layers} onChange={onLayers} maxSlopeDeg={requirements.maxSlopeDeg} />
          <Pop icon="tune" label="View settings">
            {!standing && (
              <label className="pop__field">
                <span className="controls__label">Relief x{exaggeration}</span>
                <input type="range" min="1" max="4" step="1" value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} />
              </label>
            )}
            <button type="button" className="button" onClick={() => sceneRef.current?.resetView()}>
              {standing ? 'Face the Sun' : 'Reset camera'}
            </button>
          </Pop>
          <Pop icon="info" label="About this view">
            <p className="pop__text">
              Sun and Earth: true direction and true angular size (the Sun is 0.53° wide, the Earth 1.9°), from JPL Horizons; surface:
              LOLA map on the real sphere; textures and the Sun&apos;s glare are stylized. Drag to rotate, right-drag to move; click the
              view, then scroll to zoom. Lines go from the site to the Sun (yellow) and the Earth (blue), faint when the terrain hides
              the body. Move over the ground to judge a 2.4 km cell, click to pin its card; click a pin to analyze that site. Cells are an
              overview: on summits and slopes near the pole they can differ from the precise site analysis, which is the one to use for
              decisions. &quot;On site&quot; puts the camera 2 m above the site of scenario A: the skyline is its real LOLA horizon, the ground below
              it is a drawing.
            </p>
          </Pop>
        </div>

        {!standing && (
          <BestAreas
            areas={areas}
            searching={searching}
            ready={!!(terrain && frames && samples)}
            onSearch={searchAreas}
            onFly={(a) => sceneRef.current?.flyTo(a.lat, a.lon)}
            sites={southPoleSites}
          />
        )}
        {probe && (
          <ProbeCard probe={probe} pinned={pinnedCell !== null} onClose={() => setPinnedCell(null)} maxSlopeDeg={requirements.maxSlopeDeg} />
        )}
      </div>
    </div>
  )
}
