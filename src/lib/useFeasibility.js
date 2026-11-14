import { useEffect, useRef, useState } from 'react'
import { feasibilityKey, fillLevels, prepareSky } from './feasibility.js'

const CELLS_PER_SLICE = 2500 // about a tenth of a second of work: the page stays responsive while the map is computed

/**
 * Verdict of every 2.4 km cell over the whole period (see feasibility.js), computed in slices when `enabled`, and again only
 * when the period or a requirement that matters changes. Returns { levels, computing }: levels is a Uint8Array (grid x grid)
 * once ready, null while computing or when not asked for.
 */
export function useFeasibility(terrain, frames, samples, requirements, enabled) {
  const key = feasibilityKey(requirements)
  const requirementsRef = useRef(requirements)
  const [done, setDone] = useState({ levels: null, key: null, samples: null })

  useEffect(() => {
    requirementsRef.current = requirements
  })

  useEffect(() => {
    if (!enabled || !terrain || !frames || !samples) return undefined
    if (done.levels && done.key === key && done.samples === samples) return undefined
    let cancelled = false
    const sky = prepareSky(samples)
    const levels = new Uint8Array(terrain.grid * terrain.grid)
    let from = 0
    const slice = () => {
      if (cancelled) return
      const to = Math.min(levels.length, from + CELLS_PER_SLICE)
      fillLevels(terrain, frames, sky, requirementsRef.current, levels, from, to)
      from = to
      if (from < levels.length) {
        setTimeout(slice, 0)
      } else {
        setDone({ levels, key, samples })
      }
    }
    const first = setTimeout(slice, 0)
    return () => {
      cancelled = true
      clearTimeout(first)
    }
  }, [enabled, terrain, frames, samples, key, done])

  const ready = enabled && done.levels && done.key === key && done.samples === samples
  return { levels: ready ? done.levels : null, computing: !!enabled && !ready && !!terrain && !!frames && !!samples }
}
