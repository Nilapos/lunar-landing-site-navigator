import { useEffect, useMemo, useRef, useState } from 'react'
import { formatUtc } from '../lib/format.js'
import { buildCellFrames, visibilityOverlay } from '../lib/illumination.js'
import { scoreLevel } from '../lib/scores.js'
import { loadTerrain3d, slopeOverlayRgba } from '../lib/terrain3d.js'
import { createTerrainScene, TEXTURE_SIZE } from '../lib/terrainScene.js'
import { useSky } from '../lib/useSky.js'

// Draws a grid-sized RGBA layer onto the ground texture, only inside the 80 S disc (the corners hold no data).
function drawLayer(ctx, rgba, grid) {
  const small = document.createElement('canvas')
  small.width = grid
  small.height = grid
  small.getContext('2d').putImageData(new ImageData(rgba, grid, grid), 0, 0)
  ctx.save()
  ctx.beginPath()
  ctx.arc(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2 - 2, 0, Math.PI * 2)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(small, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
  ctx.restore()
}

// 3D relief of the south pole with the sites on it and layers painted on the ground: sunlight and shadows and
// Earth visibility at a moment you choose (they move with the slider), and the forbidden zones.
// `items` come from useSitesOverview, `selected` maps a scenario label (A, B) to a site id.
export default function Terrain3D({ items, selected, onSelect, maxSlopeDeg, start, days, minSunDeg, minEarthDeg }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const [terrain, setTerrain] = useState(null)
  const [hillshade, setHillshade] = useState(null)
  const [error, setError] = useState(null)
  const [exaggeration, setExaggeration] = useState(4)
  const [showSun, setShowSun] = useState(true)
  const [showEarth, setShowEarth] = useState(false)
  const [showSlope, setShowSlope] = useState(true)
  const [timeIndex, setTimeIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [webgl] = useState(() => !!document.createElement('canvas').getContext('webgl2'))
  const sky = useSky(start, days)
  const samples = sky.data?.samples
  const frames = useMemo(() => (terrain ? buildCellFrames(terrain) : null), [terrain])
  const index = samples ? Math.min(timeIndex, samples.length - 1) : 0

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Load the data files and the hillshade picture once.
  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => !cancelled && setHillshade(image)
    image.onerror = () => !cancelled && setError('Could not load the relief picture')
    image.src = '/south-pole-hillshade.png'
    loadTerrain3d()
      .then((t) => !cancelled && setTerrain(t))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  // Create the scene once the data is here.
  useEffect(() => {
    if (!webgl || !terrain || !hillshade || !containerRef.current) return undefined
    const scene = createTerrainScene(containerRef.current, terrain, { onPick: (id) => onSelectRef.current(id) })
    sceneRef.current = scene
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [webgl, terrain, hillshade])

  // "Play" moves the moment forward, looping at the end of the period.
  useEffect(() => {
    if (!playing || !samples) return undefined
    const id = setInterval(() => setTimeIndex((i) => (i + 1) % samples.length), 120)
    return () => clearInterval(id)
  }, [playing, samples])

  // Paint the ground: hillshade, then sunlight / Earth visibility, then the forbidden zones.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !terrain || !hillshade) return
    const ctx = scene.textureCanvas.getContext('2d')
    ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
    ctx.drawImage(hillshade, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
    if ((showSun || showEarth) && samples && frames) {
      const rgba = visibilityOverlay(terrain, frames, samples[index], { sun: showSun, earth: showEarth, minSunDeg, minEarthDeg })
      drawLayer(ctx, rgba, terrain.grid)
    }
    if (showSlope) drawLayer(ctx, slopeOverlayRgba(terrain, maxSlopeDeg), terrain.grid)
    scene.refreshTexture()
  }, [terrain, hillshade, frames, samples, index, showSun, showEarth, showSlope, maxSlopeDeg, minSunDeg, minEarthDeg])

  useEffect(() => {
    sceneRef.current?.setExaggeration(exaggeration)
  }, [terrain, hillshade, exaggeration])

  // Markers: colored like the 2D map (level of the global score), with the A / B tags.
  useEffect(() => {
    sceneRef.current?.setSites(
      items.map(({ site, evaluation }) => ({
        id: site.id,
        shortName: site.shortName,
        lat: site.lat,
        lon: site.lon,
        level: evaluation ? scoreLevel(evaluation.scores.global) : 'unknown',
        selectedLabels: Object.entries(selected).filter(([, id]) => id === site.id).map(([label]) => label),
      })),
    )
  }, [terrain, hillshade, items, selected])

  if (!webgl) return <p className="notice notice--error">3D needs WebGL, which this browser does not provide.</p>
  if (error) return <p className="notice notice--error">{error}</p>
  return (
    <div className="view3d">
      <div className="view3d__controls">
        <label className="toggle">
          <input type="checkbox" checked={showSun} onChange={(e) => setShowSun(e.target.checked)} />
          <span>Sunlight and shadows</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showEarth} onChange={(e) => setShowEarth(e.target.checked)} />
          <span>Earth visible (direct link)</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showSlope} onChange={(e) => setShowSlope(e.target.checked)} />
          <span>Forbidden zones (slope above {maxSlopeDeg}°)</span>
        </label>
        <label className="view3d__slider">
          <span className="controls__label">Relief x{exaggeration}</span>
          <input type="range" min="1" max="10" step="1" value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} />
        </label>
        <button type="button" className="button" onClick={() => sceneRef.current?.resetView()}>
          Reset view
        </button>
      </div>

      <div className="view3d__time">
        <button type="button" className="button" disabled={!samples} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          className="panel__slider"
          type="range"
          min="0"
          max={samples ? samples.length - 1 : 0}
          value={index}
          disabled={!samples}
          onChange={(e) => {
            setPlaying(false)
            setTimeIndex(Number(e.target.value))
          }}
          aria-label="Moment shown on the terrain"
        />
        <span className="view3d__clock">
          {samples ? formatUtc(Date.parse(samples[index].t)) : sky.error ? `Sky data: ${sky.error}` : 'Loading the Sun and Earth positions…'}
        </span>
      </div>

      <div className="view3d__canvas" ref={containerRef}>
        {!(terrain && hillshade) && <p className="notice view3d__loading">Loading the 3D relief…</p>}
      </div>
      <p className="view3d__legend">
        <span className="swatch swatch--sun" /> sunlit <span className="swatch swatch--shadow" /> in shadow{' '}
        <span className="swatch swatch--earth" /> Earth above the horizon <span className="swatch swatch--slope" /> too steep for the rover
      </p>
      <p className="panel__detail">
        Drag to rotate, right-drag to move; click the view, then scroll to zoom. Click a pin to analyze that site. The layers use each
        cell&apos;s terrain horizon (LOLA) and the Sun and Earth positions from JPL Horizons, for the period of scenario A. This is an
        overview: cells are 2.4 km wide. Where the terrain is smooth they agree with the site analysis (99-100% of the time at Mons
        Mouton and in Shackleton), but on summits and slopes near the pole, where the Sun skims the horizon, a cell can differ from a
        precise point: use the site analysis for decisions.
      </p>
    </div>
  )
}
