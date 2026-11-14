import { useEffect, useState } from 'react'
import { addDaysIso } from './format.js'
import { ISO_DATE } from './useEphemeris.js'

/**
 * Loads the sky samples of a period from /api/sky: the point of the Moon under the Sun and under the Earth,
 * and the Earth's distance, over time. Returns { data: { samples } | null, error, loading }.
 */
export function useSky(start, days, enabled = true) {
  const key = `${start}|${days}`
  const [result, setResult] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    if (!enabled || !ISO_DATE.test(start)) return undefined
    const controller = new AbortController()
    const params = new URLSearchParams({ start, stop: addDaysIso(start, days), stepMinutes: days <= 30 ? 60 : 120 })
    fetch(`/api/sky?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        return body
      })
      .then((data) => setResult({ key, data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setResult({ key, data: null, error: error.message })
      })
    return () => controller.abort()
  }, [key, start, days, enabled])

  const current = result.key === key ? result : { data: null, error: null }
  return { data: current.data, error: current.error, loading: enabled && !current.data && !current.error }
}
