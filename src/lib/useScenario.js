import { useMemo } from 'react'
import profilesFile from '../data/horizon-profiles.json'
import { southPoleSites } from '../data/south-pole-sites.js'
import { analyzeScenario } from './scenario.js'
import { useEphemeris } from './useEphemeris.js'

export const DEFAULT_THRESHOLDS = { minSunDeg: 0, minEarthDeg: 0 }

/**
 * Everything for one scenario { siteId, start, days }: site, terrain horizon, loaded data and analysis.
 * With enabled = false nothing is fetched.
 */
export function useScenario(state, enabled = true, thresholds = DEFAULT_THRESHOLDS) {
  const site = southPoleSites.find((s) => s.id === state.siteId)
  const profile = profilesFile.profiles[site.id]
  const { data, error, loading } = useEphemeris(site, state.start, state.days, enabled)
  const { minSunDeg, minEarthDeg } = thresholds

  const analysis = useMemo(
    () => (data ? analyzeScenario(data.series, profile, { minSunDeg, minEarthDeg }) : null),
    [data, profile, minSunDeg, minEarthDeg],
  )
  return { site, profile, data, error, loading, analysis }
}
