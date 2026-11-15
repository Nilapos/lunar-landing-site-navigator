import { useCallback, useEffect, useMemo, useState } from 'react'
import { sliceRange } from './timelineTools.js'
import { useSky } from './useSky.js'

const STEP_MS = 120 // one sample per tick while playing

/**
 * One moment shared by every view of the period: the sky samples (/api/sky), the index of the sample shown,
 * and Play (loops at the end). Nothing plays by itself: the user starts it.
 *
 * Range: the dates looked at, inside the period ({ from, to }, 'YYYY-MM-DD', null = the whole period). `samples` holds only the samples
 * of the range, so the slider, the map layers and the best landing areas all follow it; `allSamples` keeps the whole period.
 * A new period (start or days) brings back the whole period.
 *
 * Returns { sky, allSamples, samples, index, sample, setIndex, playing, togglePlay, range, setRange, rangeKey }.
 */
export function useTimeline(start, days, enabled = true) {
  const sky = useSky(start, days, enabled)
  const allSamples = sky.data?.samples ?? null
  const periodKey = `${start}|${days}`
  const [rangeState, setRangeState] = useState({ periodKey, from: null, to: null })
  const range = rangeState.periodKey === periodKey ? { from: rangeState.from, to: rangeState.to } : { from: null, to: null }
  const samples = useMemo(() => sliceRange(allSamples, range.from, range.to), [allSamples, range.from, range.to])

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
  // A new range starts at its first moment.
  const setRange = useCallback(
    ({ from = null, to = null }) => {
      setRangeState({ periodKey, from: from || null, to: to || null })
      setPlaying(false)
      setRawIndex(0)
    },
    [periodKey],
  )

  return {
    sky,
    allSamples,
    samples,
    index,
    sample: samples ? samples[index] : null,
    setIndex,
    playing,
    togglePlay,
    range,
    setRange,
    rangeKey: `${range.from ?? ''}|${range.to ?? ''}`,
  }
}
