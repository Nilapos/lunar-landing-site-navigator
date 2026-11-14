import { useCallback, useEffect, useState } from 'react'
import { useSky } from './useSky.js'

const STEP_MS = 120 // one sample per tick while playing

/**
 * One moment shared by every view of the period: the sky samples (/api/sky), the index of the sample shown,
 * and Play (loops at the end). Returns { sky, samples, index, sample, setIndex, playing, togglePlay }.
 * Nothing plays by itself: the user starts it.
 */
export function useTimeline(start, days, enabled = true) {
  const sky = useSky(start, days, enabled)
  const samples = sky.data?.samples ?? null
  const [rawIndex, setRawIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const index = samples ? Math.min(rawIndex, samples.length - 1) : 0

  useEffect(() => {
    if (!playing || !samples) return undefined
    const id = setInterval(() => setRawIndex((i) => (i + 1) % samples.length), STEP_MS)
    return () => clearInterval(id)
  }, [playing, samples])

  // Moving the slider by hand stops the animation.
  const setIndex = useCallback((value) => {
    setPlaying(false)
    setRawIndex(value)
  }, [])
  const togglePlay = useCallback(() => setPlaying((p) => !p), [])

  return { sky, samples, index, sample: samples ? samples[index] : null, setIndex, playing, togglePlay }
}
