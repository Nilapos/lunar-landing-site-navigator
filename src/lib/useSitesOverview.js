import { useEffect, useMemo, useRef, useState } from 'react'
import profilesFile from '../data/horizon-profiles.json'
import { southPoleSites } from '../data/south-pole-sites.js'
import terrainFile from '../data/site-terrain.json'
import { evaluateFromMoment } from './momentScores.js'
import { analyzeScenario } from './scenario.js'
import { fetchEphemeris, ISO_DATE } from './useEphemeris.js'
import { evaluateScenario } from './verdict.js'

const keyOf = (site, start, days) => `${site.id}|${start}|${days}`

/**
 * Feasibility of every site for the same landing and period, under the same requirements. With `atMs` (the moment of the timeline) the
 * sites are judged as a landing at that moment over the mission that follows it (requirements.missionDays, or until `untilMs`, the end of
 * the range): the same evaluation as the Sky card of the selected site. Without it, a landing at the start of the period.
 * Returns { items: [{ site, evaluation | null, error | null }], loadedCount }.
 * Horizons is asked for one site at a time (it rejects simultaneous requests), so results appear one by one.
 */
export function useSitesOverview(start, days, requirements, atMs = null, untilMs = Infinity) {
  const [store, setStore] = useState({}) // key -> { series } | { error }
  const storeRef = useRef(store) // lets the loop below skip what is already loaded
  useEffect(() => {
    storeRef.current = store
  }, [store])

  useEffect(() => {
    if (!ISO_DATE.test(start)) return undefined
    const controller = new AbortController()
    ;(async () => {
      for (const site of southPoleSites) {
        const key = keyOf(site, start, days)
        if (storeRef.current[key]) continue
        try {
          const body = await fetchEphemeris(site, start, days, controller.signal)
          setStore((s) => ({ ...s, [key]: { series: body.series } }))
        } catch (e) {
          if (e.name === 'AbortError') return
          setStore((s) => ({ ...s, [key]: { error: e.message } }))
        }
      }
    })()
    return () => controller.abort()
  }, [start, days])

  const items = useMemo(
    () =>
      southPoleSites.map((site) => {
        const entry = store[keyOf(site, start, days)]
        if (!entry?.series) return { site, evaluation: null, error: entry?.error ?? null }
        const profile = profilesFile.profiles[site.id]
        const terrain = terrainFile.sites[site.id]
        const moment = atMs !== null ? evaluateFromMoment({ data: { series: entry.series }, profile, terrain }, requirements, atMs, untilMs) : null
        if (moment) return { site, evaluation: moment, error: null }
        const analysis = analyzeScenario(entry.series, profile, { minSunDeg: requirements.minSunDeg, minEarthDeg: requirements.minEarthDeg })
        const landingMs = Date.parse(entry.series[0].t)
        return { site, evaluation: evaluateScenario(analysis, requirements, landingMs, terrain), error: null }
      }),
    [store, start, days, requirements, atMs, untilMs],
  )
  return { items, loadedCount: items.filter((i) => i.evaluation).length }
}
