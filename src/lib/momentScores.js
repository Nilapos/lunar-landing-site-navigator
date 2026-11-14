// "What if we land at this moment?": the scores of a scenario when the landing happens at `atMs` instead of at the
// start of the period. Everything is measured over the period AFTER that moment (darkness, Earth link time, window
// length), with the same rules as evaluateScenario.
import { analyzeScenario } from './scenario.js'
import { evaluateScenario } from './verdict.js'

/**
 * result: { data: { series }, profile, terrain } as returned by useScenario; requirements: the rover requirements.
 * Returns an evaluation (see evaluateScenario) or null when fewer than two samples remain after the moment.
 */
export function evaluateFromMoment(result, requirements, atMs) {
  if (!result.data) return null
  const series = result.data.series.filter((p) => Date.parse(p.t) >= atMs)
  if (series.length < 2) return null
  const analysis = analyzeScenario(series, result.profile, { minSunDeg: requirements.minSunDeg, minEarthDeg: requirements.minEarthDeg })
  return evaluateScenario(analysis, requirements, Date.parse(series[0].t), result.terrain)
}
