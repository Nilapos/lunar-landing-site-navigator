import { useEffect, useRef, useState } from 'react'
import { createPrep, fillBits, prepareSky, visibilityKey } from './feasibility.js'

const SLICE_MS = 40 // work per slice: the page stays responsive while the map is prepared
const CELLS_PER_STEP = 200

/**
 * The visibility bits of every 2.4 km cell over the range (see feasibility.js), prepared in slices when `enabled`, and again only when the
 * range or the minimum elevations change. Returns { prep, computing }: prep is null while computing or when not asked for. The verdict of the
 * cells for the moment shown is then a few bit operations per cell (`levelsAt`), so the layer follows the timeline live.
 */
export function useFeasibility(terrain, frames, samples, requirements, enabled) {
  const key = visibilityKey(requirements)
  const requirementsRef = useRef(requirements)
  const [done, setDone] = useState({ prep: null, key: null, samples: null })

  useEffect(() => {
    requirementsRef.current = requirements
  })

  useEffect(() => {
    if (!enabled || !terrain || !frames || !samples) return undefined
    if (done.prep && done.key === key && done.samples === samples) return undefined
    let cancelled = false
    const prep = createPrep(terrain, prepareSky(samples), requirementsRef.current)
    let from = 0
    const slice = () => {
      if (cancelled) return
      const started = performance.now()
      do {
        const to = Math.min(prep.cells, from + CELLS_PER_STEP)
        fillBits(terrain, frames, prep, requirementsRef.current, from, to)
        from = to
      } while (from < prep.cells && performance.now() - started < SLICE_MS)
      if (from < prep.cells) setTimeout(slice, 0)
      else setDone({ prep, key, samples })
    }
    const first = setTimeout(slice, 0)
    return () => {
      cancelled = true
      clearTimeout(first)
    }
  }, [enabled, terrain, frames, samples, key, done])

  const ready = enabled && done.prep && done.key === key && done.samples === samples
  return { prep: ready ? done.prep : null, computing: !!enabled && !ready && !!terrain && !!frames && !!samples }
}
