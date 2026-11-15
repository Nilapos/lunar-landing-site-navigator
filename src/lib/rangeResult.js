// The range of dates chosen on the timeline is the period that every "if we land at this moment" figure is measured over: darkness,
// Earth link time and window length are counted up to the END OF THE RANGE, not to the end of the whole period that was loaded.
// So the Sky card, the Why tab, the "Feasible" step and the best landing areas (which all work on the range) say the same thing.
import { analyzeScenario } from './scenario.js'

/**
 * `result` (useScenario: { data: { series }, profile, ... }) restricted to the moments of `samples` (the timeline's samples of the
 * range, { t } ISO strings): the series cut to [first, last] of the samples and the analysis made again on it. Returns `result` itself
 * when the range is the whole series (or there is nothing to cut), so memoized consumers keep their identity.
 *   requirements: { minSunDeg, minEarthDeg } thresholds of the analysis.
 */
export function restrictToRange(result, requirements, samples) {
  if (!result.data || !samples || samples.length < 2) return result
  const from = Date.parse(samples[0].t)
  const to = Date.parse(samples[samples.length - 1].t)
  const series = result.data.series.filter((p) => {
    const t = Date.parse(p.t)
    return t >= from && t <= to
  })
  if (series.length === result.data.series.length || series.length < 2) return result
  const analysis = analyzeScenario(series, result.profile, { minSunDeg: requirements.minSunDeg, minEarthDeg: requirements.minEarthDeg })
  return { ...result, data: { ...result.data, series }, analysis }
}
