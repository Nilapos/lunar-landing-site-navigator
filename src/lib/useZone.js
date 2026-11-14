import { useEffect, useState } from 'react'
import { loadZone } from './zones.js'

const EMPTY = { id: null, zone: null, image: null }

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${url}`))
    image.src = url
  })
}

/**
 * The fine zone of a site (see zones.js) with its hillshade picture, loaded the first time `wanted` is true for that site.
 * Returns { zone, image } (both null while loading, or when the site has no zone).
 */
export function useZone(siteId, wanted) {
  const [state, setState] = useState(EMPTY)
  useEffect(() => {
    if (!wanted || !siteId || state.id === siteId) return undefined
    let cancelled = false
    Promise.all([loadZone(siteId), loadImage(`/zones/${siteId}.png`)])
      .then(([zone, image]) => !cancelled && setState({ id: siteId, zone, image }))
      .catch(() => !cancelled && setState({ id: siteId, zone: null, image: null })) // no zone for this site: stay on the overview
    return () => {
      cancelled = true
    }
  }, [wanted, siteId, state.id])
  return state.id === siteId ? state : EMPTY
}
