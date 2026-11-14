import { useEffect, useState } from 'react'
import { addDaysIso } from './format.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Loads Sun/Earth az/el for a site from our /api/horizons endpoint. Returns { data, error, loading }. */
export function useEphemeris(site, start, days) {
  const key = `${site.id}|${start}|${days}`
  const [result, setResult] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    if (!ISO_DATE.test(start)) return undefined
    const controller = new AbortController()
    const params = new URLSearchParams({
      lat: site.lat,
      lon: site.lon,
      start,
      stop: addDaysIso(start, days),
      stepMinutes: days <= 30 ? 60 : 120,
    })
    fetch(`/api/horizons?${params}`, { signal: controller.signal })
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
  }, [key, site.lat, site.lon, start, days])

  // Ignore a result that belongs to a previous selection.
  const current = result.key === key ? result : { data: null, error: null }
  return { data: current.data, error: current.error, loading: !current.data && !current.error }
}
