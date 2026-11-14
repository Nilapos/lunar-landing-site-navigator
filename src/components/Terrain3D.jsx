import { useEffect, useMemo, useRef, useState } from 'react'
import { southPoleSites } from '../data/south-pole-sites.js'
import { groundOverlayColors } from '../lib/cssTokens.js'
import { paintGround } from '../lib/groundTexture.js'
import { buildCellFrames } from '../lib/illumination.js'
import { createTerrainScene } from '../lib/terrainScene.js'
import { candidateRegions, sitePins, useTerrain3d } from '../lib/useTerrain3d.js'

// The Artemis III candidate regions, painted on the ground as in NASA's videos.
const REGIONS = candidateRegions(southPoleSites)

// 3D relief of the south pole with the sites on it and layers painted on the ground: sunlight and shadows and
// Earth visibility at the moment of the shared timeline, and the forbidden zones.
// `items` come from useSitesOverview, `selected` maps a scenario label (A, B) to a site id,
// `timeline` from useTimeline and `layers` ({ sun, earth, slope }) from View3DPanel.
export default function Terrain3D({ items, selected, onSelect, requirements, timeline, layers }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const { terrain, hillshade, error } = useTerrain3d()
  const [exaggeration, setExaggeration] = useState(2)
  const frames = useMemo(() => (terrain ? buildCellFrames(terrain) : null), [terrain])
  const { sample } = timeline

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Create the scene once the data is here.
  useEffect(() => {
    if (!terrain || !hillshade || !containerRef.current) return undefined
    const scene = createTerrainScene(containerRef.current, terrain, { onPick: (id) => onSelectRef.current(id) })
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [terrain, hillshade])

  // Paint the ground: hillshade, then sunlight / Earth visibility, then the forbidden zones.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !terrain || !hillshade) return
    paintGround(scene.textureCanvas, {
      hillshade,
      terrain,
      frames,
      sample,
      layers,
      requirements,
      overlay: { regions: REGIONS, colors: groundOverlayColors() },
    })
    scene.refreshTexture()
  }, [terrain, hillshade, frames, sample, layers, requirements])

  useEffect(() => {
    sceneRef.current?.setExaggeration(exaggeration)
  }, [terrain, hillshade, exaggeration])

  useEffect(() => {
    sceneRef.current?.setSites(sitePins(items, selected))
  }, [terrain, hillshade, items, selected])

  if (error) return <p className="notice notice--error">{error}</p>
  return (
    <div className="view3d view3d--fill">
      <div className="view3d__controls">
        <label className="view3d__slider">
          <span className="controls__label">Relief x{exaggeration}</span>
          <input type="range" min="1" max="10" step="1" value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} />
        </label>
        <button type="button" className="button" onClick={() => sceneRef.current?.resetView()}>
          Reset view
        </button>
      </div>
      <div className="view3d__canvas" ref={containerRef}>
        {!(terrain && hillshade) && <p className="notice view3d__loading">Loading the 3D relief…</p>}
      </div>
      <details className="panel__detail view3d__about">
        <summary>About this view and its limits</summary>
        <p>
        Drag to rotate, right-drag to move; click the view, then scroll to zoom. Click a pin to analyze that site. The layers use each
        cell&apos;s terrain horizon (LOLA) and the Sun and Earth positions from JPL Horizons, for the period of scenario A. This is an
        overview: cells are 2.4 km wide. Where the terrain is smooth they agree with the site analysis (99-100% of the time at Mons
        Mouton and in Shackleton), but on summits and slopes near the pole, where the Sun skims the horizon, a cell can differ from a
        precise point: use the site analysis for decisions.
        </p>
      </details>
    </div>
  )
}
