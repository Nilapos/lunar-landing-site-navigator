import { useEffect, useMemo, useRef, useState } from 'react'
import profilesFile from '../data/horizon-profiles.json'
import { southPoleSites } from '../data/south-pole-sites.js'
import terrainFile from '../data/site-terrain.json'
import { analyzeScenario } from './scenario.js'
import { fetchEphemeris, ISO_DATE } from './useEphemeris.js'
import { evaluateScenario } from './verdict.js'

const keyOf = (site, start, days) => `${site.id}|${start}|${days}`

/**
 * Feasibility of every site for the same landing date and period, under the same requirements.
 * Returns { items: [{ site, evaluation | null, error | null }], loadedCount }.
 * Horizons is asked for one site at a time (it rejects simultaneous requests), so results appear one by one.
 */
export function useSitesOverview(start, days, requirements) {
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
        const analysis = analyzeScenario(entry.series, profilesFile.profiles[site.id], {
          minSunDeg: requirements.minSunDeg,
          minEarthDeg: requirements.minEarthDeg,
        })
        const landingMs = Date.parse(entry.series[0].t)
        return { site, evaluation: evaluateScenario(analysis, requirements, landingMs, terrainFile.sites[site.id]), error: null }
      }),
    [store, start, days, requirements],
  )
  return { items, loadedCount: items.filter((i) => i.evaluation).length }
}
