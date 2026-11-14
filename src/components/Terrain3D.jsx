import { useEffect, useRef, useState } from 'react'
import { scoreLevel } from '../lib/scores.js'
import { loadTerrain3d, slopeOverlayRgba } from '../lib/terrain3d.js'
import { createTerrainScene, TEXTURE_SIZE } from '../lib/terrainScene.js'

// 3D relief of the south pole with the sites on it and layers painted on the ground.
// `items` come from useSitesOverview, `selected` maps a scenario label (A, B) to a site id.
export default function Terrain3D({ items, selected, onSelect, maxSlopeDeg }) {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const onSelectRef = useRef(onSelect)
  const [terrain, setTerrain] = useState(null)
  const [hillshade, setHillshade] = useState(null)
  const [error, setError] = useState(null)
  const [exaggeration, setExaggeration] = useState(4)
  const [showSlope, setShowSlope] = useState(true)
  const [webgl] = useState(() => !!document.createElement('canvas').getContext('webgl2'))

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

  // Paint the ground: hillshade, then the layers on top.
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !terrain || !hillshade) return
    const ctx = scene.textureCanvas.getContext('2d')
    ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
    ctx.drawImage(hillshade, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
    if (showSlope) {
      const small = document.createElement('canvas')
      small.width = terrain.grid
      small.height = terrain.grid
      small.getContext('2d').putImageData(new ImageData(slopeOverlayRgba(terrain, maxSlopeDeg), terrain.grid, terrain.grid), 0, 0)
      // Layers only inside the 80 S disc: the corners of the map hold no real data.
      ctx.save()
      ctx.beginPath()
      ctx.arc(TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2 - 2, 0, Math.PI * 2)
      ctx.clip()
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(small, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
      ctx.restore()
    }
    scene.refreshTexture()
  }, [terrain, hillshade, showSlope, maxSlopeDeg])

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
          <input type="checkbox" checked={showSlope} onChange={(e) => setShowSlope(e.target.checked)} />
          <span>Forbidden zones: slope above {maxSlopeDeg}° (rover limit)</span>
        </label>
        <label className="view3d__slider">
          <span className="controls__label">Relief exaggeration x{exaggeration}</span>
          <input type="range" min="1" max="10" step="1" value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} />
        </label>
        <button type="button" className="button" onClick={() => sceneRef.current?.resetView()}>
          Reset view
        </button>
      </div>
      <div className="view3d__canvas" ref={containerRef}>
        {!(terrain && hillshade) && <p className="notice view3d__loading">Loading the 3D relief…</p>}
      </div>
      <p className="panel__detail">
        Drag to rotate, right-drag to move; click the view, then scroll to zoom. Click a pin to analyze that site. Relief from the LOLA map
        (2.4 km cells; detail comes from the 80 m picture). Red = at least 10% of the cell is steeper than the rover limit.
      </p>
    </div>
  )
}
