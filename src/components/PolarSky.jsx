import { useEffect, useMemo, useRef, useState } from 'react'
import horizonFile from '../data/horizon-profiles.json'
import { southPoleSites } from '../data/south-pole-sites.js'
import { findBestAreas } from '../lib/bestAreas.js'
import { pointSite } from '../lib/pointSite.js'
import { probeCell } from '../lib/cellProbe.js'
import { cellLabel, finestCell } from '../lib/hoverCell.js'
import { cssToken, groundOverlayColors } from '../lib/cssTokens.js'
import { formatPercent } from '../lib/format.js'
import { groundLook, layerPlan, paintBase, paintFine, staticLayers, zoneLayer } from '../lib/groundTexture.js'
import { buildCellFrames } from '../lib/illumination.js'
import { paintWindowGrid } from '../lib/mapGrid.js'
import { latLonOf, siteBodyStates } from '../lib/polarSky.js'
import { createMapScene } from '../lib/mapScene.js'
import { createPolarSkyScene } from '../lib/polarSkyScene.js'
import { candidateRegions, sitePins, useTerrain3d } from '../lib/useTerrain3d.js'
import { unitVector } from '../lib/sky.js'
import { FULL_WINDOW, TILE_LAYERS } from '../lib/tileGrid.js'
import { TileWindow } from '../lib/tileWindow.js'
import { useFeasibility } from '../lib/useFeasibility.js'
import { useFineChunks } from '../lib/useFineGrid.js'
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

const MIN_PAINT_MS = 66 // the layers on the ground are redrawn at most about 15 times a second

// What the detail canvas is made of, bottom first (tileWindow.js): the imagery gets sharper with the zoom (LRO WAC, then the LRO NAC
// mosaic of the south pole where it exists), then the layers of Moon Trek that the user switched on.
const IMAGERY = [
  { layer: TILE_LAYERS.wac, minLevel: 3, style: 'image' },
  { layer: TILE_LAYERS.nac, minLevel: 6, style: 'image' },
]
const imagerySources = (layers) => [
  ...IMAGERY,
  ...(layers.rock ? [{ layer: TILE_LAYERS.rock, minLevel: 3, style: 'rock', opacity: 0.6 }] : []),
  ...(layers.psr ? [{ layer: TILE_LAYERS.psr, minLevel: 3, style: 'psr', opacity: 1 }] : []),
]

const VIEWS = [
  { key: 'globe', label: 'Globe' },
  { key: 'orbit', label: 'Orbit' },
  { key: 'top', label: 'Top view' },
]

// The hover card: "is this cell a good landing zone?"
function ProbeCard({ probe, maxSlopeDeg, cell }) {
  const now = (label, s) => `${label} ${s.margin > 0 ? 'visible' : 'hidden'} now (${signed(s.el)}, horizon ${signed(s.horizon)})`
  return (
    <div className="skycard skycard--probe">
      <p className="skycard__title">
        <span className={`skycard__badge skycard__badge--${probe.level}`}>
          {LEVEL_LABEL[probe.level]} {probe.score}/100
        </span>
        <span className="skycard__hint">click to analyze this place</span>
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
      <p className="skycard__hint">
        {cellLabel(cell.sizeKm)}
        {cell.level === 'overview' ? ': an overview that can differ from the site analysis on summits and slopes. Zoom in for finer cells.' : ' (zoomed in: finer data than the overview).'}
      </p>
    </div>
  )
}

/**
 * The one 3D view of the south pole: the curved cap with the Sun and the Earth in the sky, the layers painted on the
 * ground (they follow the shared timeline), and four cameras: "globe" (the whole Moon at true size, lit by the real Sun),
 * "orbit" (oblique, over the pole), "top" (straight down, like a map) with an animated flight between them, and "site"
 * (standing on the site of scenario A). The view opens on the globe, then dives to the pole.
 *   view: 'globe' | 'orbit' | 'top' | 'site';  onView(view): change of camera (all but site);
 *   evaluation, startMs, onLand, onShiftLanding: the score card (see ScoreCard).
 */
export default function PolarSky({ items, selected, onSelect, siteA, onPickPoint, requirements, timeline, layers, onLayers, view, onView, evaluation, startMs, onLand, onShiftLanding }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const onPickPointRef = useRef(onPickPoint)
  const fineRef = useRef([])
  const lastPaintRef = useRef(0)
  const introDoneRef = useRef(false) // the view opens on the globe and dives, once; later switches of view do not replay it
  const pinsShownRef = useRef({ scene: null, json: null })
  const flightRef = useRef(false) // false until the first pose is set: no flight when the view opens
  const { terrain, hillshade, photo, error } = useTerrain3d()
  const [exaggeration, setExaggeration] = useState(1)
  const [hover, setHover] = useState(null) // the finest cell under the pointer (hoverCell.js)
  const locateRef = useRef(() => null)
  const [areas, setAreas] = useState(null) // best areas found for the period, null before the first search
  const [searching, setSearching] = useState(false)
  const [mapWindow, setMapWindow] = useState(FULL_WINDOW) // the part of the map the grid and the detail are drawn for (follows the zoom)
  const tilesRef = useRef(null)
  const [viewInfo, setViewInfo] = useState(null) // where the camera looks and from how far (for the 500 m chunks)
  const fineChunks = useFineChunks(viewInfo)
  const [near, setNear] = useState(false) // the camera is close to the selected site: its fine zone replaces the overview
  const standing = view === 'site'
  // The Top view is a flat 2D map (mapScene.js): no globe to load, a fraction of the drawing cost. The other views are the 3D scene.
  const engine = view === 'top' ? 'map' : '3d'
  const frames = useMemo(() => (terrain ? buildCellFrames(terrain) : null), [terrain])
  const { sample, samples, index, playing } = timeline

  // The site of scenario A: the lines, the score card and the site camera are about it.
  const site = siteA ?? items.find((i) => i.site.id === selected.A)?.site ?? null
  const profileOf = (s) => (s.custom ? s.profile : horizonFile.profiles[s.id])
  const states = useMemo(
    () => (site && sample ? siteBodyStates(site, sample, profileOf(site), requirements) : null),
    [site, sample, requirements],
  )

  // Fine zone (100 to 250 m cells) of the selected site, loaded when the camera first comes close.
  const zoneData = useZone(site && !site.custom ? site.id : null, near)
  const zoneGrid = useMemo(() => (zoneData.zone ? zoneFrames(zoneData.zone) : null), [zoneData.zone])
  const zoneShown = near && !standing && !!zoneData.zone && !!zoneData.image

  // The Feasible layer: the verdict of every 2.4 km cell over the period, computed in slices.
  const feasible = useFeasibility(terrain, frames, samples, requirements, !!layers.feasible)

  // The cell under the pointer is found at the finest resolution there is: the shown fine zone, a loaded 500 m chunk, the overview.
  useEffect(() => {
    locateRef.current = (x, y, overviewIndex) =>
      terrain && frames
        ? finestCell(x, y, {
            overview: { terrain, frames, grid: terrain.grid, index: overviewIndex },
            zone: zoneShown ? { zone: zoneData.zone, frames: zoneGrid } : null,
            chunks: fineChunks,
          })
        : null
  })
  const shownHover = standing ? null : hover
  const probe = useMemo(
    () => (shownHover && samples && shownHover.frames?.valid[shownHover.index] ? probeCell(shownHover.terrain, shownHover.frames, shownHover.index, samples, index, requirements) : null),
    [shownHover, samples, index, requirements],
  )

  useEffect(() => {
    onSelectRef.current = onSelect
    onPickPointRef.current = onPickPoint
  }, [onSelect, onPickPoint])

  useEffect(() => {
    fineRef.current = fineChunks
  }, [fineChunks])

  // A click on the ground selects that place: the whole period is then analyzed for it, like for a named site.
  const pickPoint = (point) => {
    if (!point || !terrain) return
    const { lat, lon } = latLonOf(point)
    const site = pointSite(lat, lon, { terrain, fineChunks: fineRef.current })
    if (site) onPickPointRef.current?.(site)
  }
  const pickPointRef = useRef(pickPoint)
  useEffect(() => {
    pickPointRef.current = pickPoint
  })

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
    const make = engine === 'map' ? createMapScene : createPolarSkyScene
    const scene = make(containerRef.current, terrain, {
      regions: REGIONS,
      gridColors: groundOverlayColors(),
      onPick: (id) => onSelectRef.current(id),
      onProbe: setHover,
      locateCell: (x, y, overviewIndex) => locateRef.current(x, y, overviewIndex),
      onPin: (cell, point) => pickPointRef.current(point),
      onNear: setNear,
      onView: setViewInfo,
      onWindow: setMapWindow,
    })
    sceneRef.current = scene
    const tiles = new TileWindow({
      canvas: scene.ground.detailCanvas,
      sources: [],
      tint: cssToken('--color-layer-psr'),
      onPainted: () => scene.ground.refreshDetail(),
    })
    tilesRef.current = tiles
    if (import.meta.env.DEV) window.__tiles = tiles // inspection from the console: __tiles.win, __tiles.sources
    if (import.meta.env.DEV) window.__polarSky = scene // profiling from the console: __polarSky.benchmark()
    flightRef.current = false
    return () => {
      tiles.dispose()
      tilesRef.current = null
      scene.dispose()
      sceneRef.current = null
    }
  }, [terrain, hillshade, engine])

  // The ground in pieces (capMaterial.js): the base and the overlay are painted once, here, when their pictures are there.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !terrain || !hillshade) return
    paintBase(scene.ground.baseCanvas, { hillshade, photo })
    scene.ground.refreshBase()
    scene.ground.setLook(groundLook(photo))
  }, [terrain, hillshade, engine, photo])

  // The window of the map (it follows the zoom): the grid with its values, and the detail (sharper imagery, PSR, rock abundance) drawn
  // for it. What the tiles that have not arrived yet will add is drawn as they come.
  const psrOn = !!layers.psr
  const rockOn = !!layers.rock
  useEffect(() => {
    const scene = sceneRef.current
    const tiles = tilesRef.current
    if (!scene || !tiles) return
    if (scene.screenGrid) scene.ground.overlayCanvas.getContext('2d').clearRect(0, 0, scene.ground.overlayCanvas.width, scene.ground.overlayCanvas.height)
    else paintWindowGrid(scene.ground.overlayCanvas, mapWindow, { regions: REGIONS, colors: groundOverlayColors() })
    scene.ground.refreshOverlay()
    tiles.configure(imagerySources({ psr: psrOn, rock: rockOn }))
    tiles.setWindow(mapWindow)
    scene.ground.setWindow(mapWindow)
  }, [terrain, hillshade, engine, mapWindow, psrOn, rockOn])

  // The fine zone replaces the overview under it: a hole in the cap.
  useEffect(() => {
    sceneRef.current?.ground.setHole(zoneShown ? zonePatchRect(zoneData.zone) : null)
  }, [terrain, hillshade, engine, zoneShown, zoneData.zone])

  // The layers of the 2.4 km map: the GPU computes sunlight, shadows, Earth visibility and the instant Optimal layer from the Sun
  // and Earth directions, so a step of the timeline only sets a few uniforms (capMaterial.js).
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !terrain || !hillshade) return
    const plan = layerPlan({ frames, sample, samples, layers })
    scene.ground.setLive(
      { sun: plan.live === 'vis' && !!layers.sun, earth: plan.live === 'vis' && !!layers.earth, go: plan.live === 'go' },
      sample
        ? { sunDir: unitVector(sample.sunLat, sample.sunLon), earthUnit: unitVector(sample.earthLat, sample.earthLon), earthKm: sample.earthKm }
        : { sunDir: [1, 0, 0], earthUnit: [1, 0, 0], earthKm: 384400 },
      requirements,
    )
  }, [terrain, hillshade, engine, frames, sample, samples, layers, requirements])

  const hasSample = !!sample
  const { go: goOn, goPeriod: goPeriodOn, feasible: feasibleOn, slope: slopeOn } = layers
  // The layers that do not depend on the moment (Optimal over the period, Feasible, forbidden zones): recomputed only when their
  // inputs change, not at every step of the timeline.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !terrain || !hillshade) return
    scene.ground.setStatic(staticLayers({ terrain, frames, sample: hasSample ? {} : null, samples, layers: { go: goOn, goPeriod: goPeriodOn, feasible: feasibleOn, slope: slopeOn }, requirements, feasibleLevels: feasible.levels }))
  }, [terrain, hillshade, engine, frames, samples, goOn, goPeriodOn, feasibleOn, slopeOn, hasSample, requirements, feasible.levels])

  // The same layers at the resolution of the loaded 500 m chunks, drawn on the CPU: at most MIN_PAINT_MS apart (the last state
  // is always painted), since a play or a drag of the timeline changes the moment far more often than the eye can tell.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !terrain || !hillshade) return undefined
    if (fineChunks.length === 0) {
      scene.ground.refreshFine(false)
      return undefined
    }
    const run = () => {
      scene.ground.refreshFine(paintFine(scene.ground.fineCanvas, { fine: fineChunks, sample, samples, layers, requirements }))
      lastPaintRef.current = performance.now()
    }
    const wait = MIN_PAINT_MS - (performance.now() - lastPaintRef.current)
    if (wait <= 0) {
      run()
      return undefined
    }
    const timer = setTimeout(run, wait)
    return () => clearTimeout(timer)
  }, [terrain, hillshade, engine, sample, samples, layers, requirements, fineChunks])

  // The fine zone: its mesh when shown, and its own texture (same layers, computed on its cells).
  useEffect(() => {
    sceneRef.current?.setZone(zoneData.zone, zoneShown)
  }, [terrain, hillshade, engine, zoneData.zone, zoneShown])

  // The layers on the cells of the zone, for the moment shown.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !zoneShown) return
    scene.zoneGround.setLook(groundLook(photo).layerAlpha)
    scene.zoneGround.setLayer(zoneLayer({ zone: zoneData.zone, frames: zoneGrid, sample, samples, layers, requirements }), zoneData.zone.grid)
  }, [engine, zoneShown, zoneData, zoneGrid, sample, samples, layers, requirements, photo])

  // The imagery of the zone (sharpened with the tiles of Moon Trek, the zone's own hillshade until they have come) and its graticule.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !zoneShown || !zoneData.zone) return undefined
    const { zone } = zoneData
    const win = { cx: zone.centerXKm, cy: zone.centerYKm, span: zone.sizeKm }
    const tiles = new TileWindow({
      canvas: scene.zoneGround.imageryCanvas,
      sources: imagerySources({ psr: psrOn, rock: rockOn }),
      underlay: zoneData.image,
      tint: cssToken('--color-layer-psr'),
      onPainted: () => scene.zoneGround.refreshImagery(),
    })
    paintWindowGrid(scene.zoneGround.gridCanvas, win, { regions: REGIONS, colors: groundOverlayColors() })
    scene.zoneGround.refreshGrid()
    tiles.setWindow(win)
    return () => tiles.dispose()
  }, [engine, zoneShown, zoneData, psrOn, rockOn])

  useEffect(() => {
    sceneRef.current?.setExaggeration(exaggeration)
  }, [terrain, hillshade, engine, exaggeration])

  useEffect(() => {
    // The selected point (if any) gets a pin like a named site, colored by its score.
    const pinItems = site?.custom ? [...items, { site, evaluation }] : items
    // Rebuilding the pins (geometry and label textures) is costly, and `evaluation` changes at every step of the timeline: only
    // do it when what the pins show has changed.
    const scene = sceneRef.current
    if (!scene) return
    const pins = sitePins(pinItems, selected)
    const json = JSON.stringify(pins)
    if (pinsShownRef.current.scene === scene && pinsShownRef.current.json === json) return
    pinsShownRef.current = { scene, json }
    scene.setSites(pins)
  }, [terrain, hillshade, engine, items, selected, site, evaluation])

  useEffect(() => {
    sceneRef.current?.setSample(sample)
  }, [terrain, hillshade, engine, sample])

  useEffect(() => {
    sceneRef.current?.setFocus(
      site && states ? { lat: site.lat, lon: site.lon, sunVisible: states.sun.visible, earthVisible: states.earth.visible } : null,
    )
  }, [terrain, hillshade, engine, site, states])

  // Camera: standing on the site, or one of the orbit poses (the move between them is animated). The first time, the view opens
  // on the whole Moon and dives to the pole, like NASA's videos.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return undefined
    const profile = site && profileOf(site)
    let dive = null
    if (standing && profile) {
      scene.setView({ lat: site.lat, lon: site.lon, profile })
    } else {
      scene.setView(null)
      const pose = view === 'top' || view === 'globe' ? view : 'orbit'
      const first = !introDoneRef.current
      introDoneRef.current = true
      if (engine === '3d' && first && pose !== 'globe') {
        scene.setOrbitPose('globe', false)
        dive = setTimeout(() => scene.setOrbitPose(pose, true), 1200)
      } else {
        scene.setOrbitPose(pose, flightRef.current)
      }
    }
    flightRef.current = true
    return () => clearTimeout(dive)
  }, [terrain, hillshade, engine, standing, view, site])

  if (error) return <p className="notice notice--error">{error}</p>
  return (
    <div className="view3d view3d--fill">
      <div className="view3d__canvas view3d__canvas--sky" ref={containerRef}>
        {!(terrain && hillshade) && <p className="notice view3d__loading">Loading the 3D relief…</p>}
        {feasible.computing && <p className="notice view3d__computing">Computing which places are feasible over the period…</p>}

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
          {engine === 'map' && (
            <div className="tabs" role="group" aria-label="Zoom the map">
              <button type="button" className="tabs__tab" title="Zoom in (also the mouse wheel and a double click)" aria-label="Zoom in" onClick={() => sceneRef.current?.zoomBy(0.55)}>
                +
              </button>
              <button type="button" className="tabs__tab" title="Zoom out" aria-label="Zoom out" onClick={() => sceneRef.current?.zoomBy(1 / 0.55)}>
                −
              </button>
              <button type="button" className="tabs__tab" title="The whole map" onClick={() => sceneRef.current?.resetView()}>
                Fit
              </button>
            </div>
          )}
          <LayerToggles layers={layers} onChange={onLayers} maxSlopeDeg={requirements.maxSlopeDeg} />
          <Pop icon="tune" label="View settings">
            {!standing && engine === '3d' && (
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
              LOLA map on the real sphere; textures and the Sun&apos;s glare are stylized, but the Moon and the cap itself are real LRO WAC mosaics (NASA/GSFC/Arizona State University, via NASA Moon Trek). Zooming in sharpens the imagery with Moon Trek tiles: the LRO WAC mosaic, then the LRO NAC mosaic of the south pole (down to about 4 m per pixel, poleward of 85.5 S). The PSR layer is the LROC NAC mosaic of the permanently shadowed regions, the Rocks layer the LRO Diviner rock abundance (no data within about 280 km of the pole). Drag to rotate, right-drag to move; click the
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
            onFly={(a) => {
              sceneRef.current?.flyTo(a.lat, a.lon)
              if (terrain) {
                const area = pointSite(a.lat, a.lon, { terrain, fineChunks: fineRef.current })
                if (area) onPickPointRef.current?.(area)
              }
            }}
            sites={southPoleSites}
          />
        )}
        {probe && (
          <ProbeCard probe={probe} maxSlopeDeg={requirements.maxSlopeDeg} cell={shownHover} />
        )}
      </div>
    </div>
  )
}
