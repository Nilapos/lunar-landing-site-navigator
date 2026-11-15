import { useEffect, useState } from 'react'
import { addDaysIso } from './format.js'

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/ // a date, or a date and time (UT)

// The period the timeline covers by default: 346.6 days, the eclipse (draconic) year, i.e. the time the Sun takes to come back to the same
// node of the Moon's orbit. It holds a whole cycle of the polar lighting (the Sun's elevation at the pole follows it).
export const LUNAR_YEAR_DAYS = 346.6

/** Time between two samples (minutes): hourly up to 30 days, every 2 h beyond (a lunar year is then 4160 rows, see LIMITS.maxRows). */
export const stepMinutesFor = (days) => (days <= 30 ? 60 : 120)

/** Sun and Earth az/el for a site from our /api/horizons endpoint (the body of its JSON answer). */
export async function fetchEphemeris(site, start, days, signal) {
  const params = new URLSearchParams({
    lat: site.lat,
    lon: site.lon,
    start,
    stop: addDaysIso(start, days),
    stepMinutes: stepMinutesFor(days),
  })
  const res = await fetch(`/api/horizons?${params}`, { signal })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

/**
 * Loads Sun/Earth az/el for a site. Returns { data, error, loading }.
 * With enabled = false nothing is fetched (loading stays false, data null).
 */
export function useEphemeris(site, start, days, enabled = true) {
  const key = `${site.id}|${start}|${days}`
  const [result, setResult] = useState({ key: null, data: null, error: null })

  useEffect(() => {
    if (!enabled || !ISO_DATE.test(start)) return undefined
    const controller = new AbortController()
    fetchEphemeris(site, start, days, controller.signal)
      .then((data) => setResult({ key, data, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setResult({ key, data: null, error: error.message })
      })
    return () => controller.abort()
  }, [key, site, start, days, enabled])

  // Ignore a result that belongs to a previous selection.
  const current = result.key === key ? result : { data: null, error: null }
  return { data: current.data, error: current.error, loading: enabled && !current.data && !current.error }
}
