import { useEffect, useState } from 'react'
import { scoreLevel } from './scores.js'
import { loadTerrain3d } from './terrain3d.js'

/**
 * Loads what the 3D views draw: the grid data files, the hillshade picture and the LRO photograph of the cap (optional: null
 * while loading or if the file is missing). Returns { terrain, hillshade, photo, error }.
 */
export function useTerrain3d() {
  const [terrain, setTerrain] = useState(null)
  const [hillshade, setHillshade] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.onload = () => !cancelled && setHillshade(image)
    image.onerror = () => !cancelled && setError('Could not load the relief picture')
    image.src = '/south-pole-hillshade.png'
    const picture = new Image()
    picture.onload = () => !cancelled && setPhoto(picture)
    picture.src = '/south-pole-photo.jpg'
    loadTerrain3d()
      .then((t) => !cancelled && setTerrain(t))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [])

  return { terrain, hillshade, photo, error }
}

/** Pins for the 3D scenes: colored like the 2D map (level of the global score), with the A / B tags. */
export function sitePins(items, selected) {
  return items.map(({ site, evaluation }) => ({
    id: site.id,
    shortName: site.shortName,
    lat: site.lat,
    lon: site.lon,
    level: evaluation ? scoreLevel(evaluation.scores.global) : 'unknown',
    selectedLabels: Object.entries(selected)
      .filter(([, id]) => id === site.id)
      .map(([label]) => label),
  }))
}

/** Artemis III candidate regions among the sites, drawn as squares on the ground like in NASA's videos. */
export function candidateRegions(sites) {
  return sites.filter((s) => s.group === 'artemis').map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }))
}
