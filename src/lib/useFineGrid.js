import { useEffect, useMemo, useRef, useState } from 'react'
import { chunksNear, loadFineChunk, loadFineIndex } from './fineGrid.js'

const MAX_DISTANCE_KM = 600 // the camera must be closer than this to the target for the 500 m cells to be wanted
const MAX_CHUNKS = 80 // chunks shown around the target (about 2.4 MB downloaded)

/**
 * The 500 m chunks around the point the camera looks at, loaded as it moves (and kept, up to what was seen).
 * `view`: { xKm, yKm, distanceKm } (map plane, from the scene) or null. Returns the loaded chunks near it; an empty list
 * when there is no fine grid (the index is missing) or the camera is far away.
 */
export function useFineChunks(view) {
  const [index, setIndex] = useState(undefined) // undefined while loading, null when there is none
  const [chunkMap, setChunkMap] = useState(() => new Map())
  const asked = useRef(new Set()) // chunks already requested: never asked twice, even when missing

  useEffect(() => {
    let cancelled = false
    loadFineIndex().then((i) => !cancelled && setIndex(i))
    return () => {
      cancelled = true
    }
  }, [])

  const wanted = useMemo(
    () => (index && view && view.distanceKm < MAX_DISTANCE_KM ? chunksNear(index, view.xKm, view.yKm, MAX_CHUNKS) : []),
    [index, view],
  )

  useEffect(() => {
    if (!index) return
    for (const [J, I] of wanted) {
      const key = `${J}-${I}`
      if (asked.current.has(key)) continue
      asked.current.add(key)
      loadFineChunk(index, J, I)
        .then((chunk) => setChunkMap((previous) => new Map(previous).set(key, chunk)))
        .catch(() => {}) // missing chunk: the overview stays there
    }
  }, [index, wanted])

  return useMemo(() => wanted.map(([J, I]) => chunkMap.get(`${J}-${I}`)).filter(Boolean), [wanted, chunkMap])
}
