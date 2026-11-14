import { useMemo } from 'react'
import profilesFile from '../data/horizon-profiles.json'
import { southPoleSites } from '../data/south-pole-sites.js'
import terrainFile from '../data/site-terrain.json'
import { analyzeScenario } from './scenario.js'
import { useEphemeris } from './useEphemeris.js'

export const DEFAULT_THRESHOLDS = { minSunDeg: 0, minEarthDeg: 0 }

/**
 * Everything for one scenario { siteId, start, days }: site, terrain horizon, loaded data and analysis.
 * `customSite` (pointSite.js) is a point the user selected on the map: it is used when its id is the scenario's site.
 * With enabled = false nothing is fetched.
 */
export function useScenario(state, enabled = true, thresholds = DEFAULT_THRESHOLDS, customSite = null) {
  const site = customSite && customSite.id === state.siteId ? customSite : southPoleSites.find((s) => s.id === state.siteId)
  const profile = site.custom ? site.profile : profilesFile.profiles[site.id]
  const terrain = site.custom ? site.terrainStats : terrainFile.sites[site.id]
  const { data, error, loading } = useEphemeris(site, state.start, state.days, enabled)
  const { minSunDeg, minEarthDeg } = thresholds

  const analysis = useMemo(
    () => (data ? analyzeScenario(data.series, profile, { minSunDeg, minEarthDeg }) : null),
    [data, profile, minSunDeg, minEarthDeg],
  )
  return { site, profile, terrain, data, error, loading, analysis }
}
