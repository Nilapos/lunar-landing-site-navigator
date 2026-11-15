import { showDateTime } from '../lib/format.js'
import { scoreLevel } from '../lib/scores.js'
import PolarMap from './PolarMap.jsx'

// All sites at a glance: the map and a ranking by global score, for scenario A's landing date and period.
// Click a marker or a row to open that site (in scenario A, or B when compare mode is set to B).
export default function SitesOverview({ items, loadedCount, start, days, selected, onSelect, compare, target, onTargetChange }) {
  const ranked = [...items].sort((a, b) => (b.evaluation?.scores.global ?? -1) - (a.evaluation?.scores.global ?? -1))
  return (
    <section className="panel overview" aria-label="Overview of all sites">
      <div className="overview__head">
        <h2 className="panel__title">All sites at a glance</h2>
        <p className="panel__detail overview__caption">
          Landing {showDateTime(start)} UT, {days} days, current rover requirements. {loadedCount}/{items.length} computed.
          Click a marker or a row to analyze that site.
        </p>
        {compare && (
          <div className="overview__target" role="radiogroup" aria-label="Clicking a site sets scenario">
            <span className="controls__label">Click sets scenario</span>
            {['A', 'B'].map((t) => (
              <label key={t} className="overview__radio">
                <input type="radio" name="map-target" checked={target === t} onChange={() => onTargetChange(t)} /> {t}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="overview__body">
        <PolarMap items={items} selected={selected} onSelect={onSelect} />
        <div className="compare__scroll">
          <table className="compare overview__table">
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col">Global</th>
                <th scope="col">Night endurance</th>
                <th scope="col">Telecom</th>
                <th scope="col">Window</th>
                <th scope="col">Topo.</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ site, evaluation, error }) => (
                <tr key={site.id} className="overview__row" onClick={() => onSelect(site.id)}>
                  <th scope="row">
                    <button type="button" className="overview__site">
                      {site.shortName}
                    </button>
                  </th>
                  {evaluation ? (
                    <>
                      <td className={`score score--${scoreLevel(evaluation.scores.global)}`}>{evaluation.scores.global}</td>
                      <td className={`score score--${scoreLevel(evaluation.scores.solar)}`}>{evaluation.scores.solar}</td>
                      <td className={`score score--${scoreLevel(evaluation.scores.telecom)}`}>{evaluation.scores.telecom}</td>
                      <td className={`score score--${scoreLevel(evaluation.scores.window)}`}>{evaluation.scores.window}</td>
                      <td className={`score score--${scoreLevel(evaluation.scores.topography)}`}>{evaluation.scores.topography}</td>
                    </>
                  ) : (
                    <td colSpan="5" className="compare__delta">
                      {error ? `Error: ${error}` : 'Loading…'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
