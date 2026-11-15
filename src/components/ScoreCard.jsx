import { useState } from 'react'
import { formatUtc } from '../lib/format.js'
import { causeText } from '../lib/polarSky.js'
import { MAX_SCORE, scoreLevel } from '../lib/scores.js'
import { LEVEL_LABEL } from '../lib/verdict.js'

const GAUGES = [
  { key: 'solar', label: 'Night endurance' },
  { key: 'telecom', label: 'Telecom' },
  { key: 'window', label: 'Window' },
  { key: 'topography', label: 'Terrain' },
  { key: 'energy', label: 'Energy collected / Day' }, // only when the vehicles have power specs (scores.energy)
]
const ITEM_OF_GAUGE = { solar: 'power', telecom: 'comms', window: 'window', topography: 'terrain', energy: 'energy' }

function BodyLine({ name, state }) {
  return (
    <p className={`scorecard__body scorecard__body--${state.visible ? 'ok' : 'fail'}`}>
      <span className="scorecard__dot" aria-hidden="true" />
      {causeText(name, state)}
    </p>
  )
}

// What holds the site back, in words: every requirement under its threshold, with how much of the need the site offers.
// (The global score is an average; the verdict is the worst requirement, so a good-looking score can still be "not feasible".)
function Blockers({ evaluation }) {
  // Informative items (the energy balance) never hold a site back, so they are not listed here.
  const held = evaluation.items.filter((i) => i.level !== 'ok' && !i.informative).sort((a, b) => a.ratio - b.ratio)
  if (held.length === 0) return <p className="scorecard__met">Every requirement is met with margin.</p>
  return (
    <div className="scorecard__blockers">
      <p className="scorecard__blockers-title">{evaluation.overall === 'fail' ? 'Not feasible because' : 'Marginal because'}</p>
      <ul>
        {held.map((i) => (
          <li key={i.key} title={i.detail}>
            <span className={`dot dot--${i.level}`} aria-hidden="true" />
            <strong>{i.label}</strong>
            <span>{Number.isFinite(i.ratio) ? `${Math.round(i.ratio * 100)}% of the need` : 'ok'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The one card of the sky views: where the site stands if we land at the moment shown. Global score and four small
 * gauges, the Sun and Earth in words, and on demand the full feasibility list.
 *   evaluation: from evaluateScenario / evaluateFromMoment (or null while loading);  states: { sun, earth } or null;
 *   atMs: the moment;  startMs: the landing time of the scenario;  onLand(): make the moment the landing time;
 *   onShiftLanding(ms): move the landing forward by ms.
 */
export default function ScoreCard({ site, atMs, startMs, evaluation, states, onLand, onShiftLanding, live }) {
  const [details, setDetails] = useState(false)
  if (!site) return null
  const moved = atMs !== null && atMs !== startMs
  const level = evaluation ? scoreLevel(evaluation.scores.global) : 'unknown'
  return (
    <div className="scorecard" aria-live={live ? 'polite' : 'off'}>
      <header className="scorecard__head">
        <span className="scorecard__site">{site.shortName}</span>
        {atMs !== null && <span className="scorecard__time">{formatUtc(atMs)}</span>}
      </header>

      {site.custom && (
        <p className="scorecard__caption" title={site.note}>
          Selected point (approximate: {site.gridSource} grid cell)
        </p>
      )}

      <div className="scorecard__score">
        <span className={`scorecard__value scorecard__value--${level}`}>{evaluation ? evaluation.scores.global : '–'}</span>
        <span className="scorecard__max">% of the need (mean)</span>
        {evaluation && <span className={`pill pill--${evaluation.overall}`}>{LEVEL_LABEL[evaluation.overall]}</span>}
      </div>
      <p className="scorecard__caption">{moved ? 'If we land at this moment' : 'Landing at the start of the period'}</p>

      {evaluation && <Blockers evaluation={evaluation} />}

      {evaluation && (
        <ul className="gauges">
          {GAUGES.filter((g) => evaluation.scores[g.key] !== undefined).map((g) => (
            <li key={g.key} className="gauges__row" title={evaluation.items.find((i) => i.key === ITEM_OF_GAUGE[g.key])?.detail}>
              <span className="gauges__label">{g.label}</span>
              <span className="gauges__bar">
                {/* The bar goes up to 200% of the need; the mark in the middle is 100% (requirement just met). */}
                <span className={`gauges__fill gauges__fill--${scoreLevel(evaluation.scores[g.key])}`} style={{ width: `${(evaluation.scores[g.key] / MAX_SCORE) * 100}%` }} />
              </span>
              <span className="gauges__value">{evaluation.scores[g.key]}%</span>
            </li>
          ))}
        </ul>
      )}

      {states && (
        <div className="scorecard__bodies">
          <BodyLine name="Sun" state={states.sun} />
          <BodyLine name="Earth" state={states.earth} />
        </div>
      )}

      <div className="scorecard__actions">
        {moved && (
          <button type="button" className="button button--small" onClick={onLand}>
            Land here
          </button>
        )}
        {evaluation && (
          <button type="button" className="link-button" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
            {details ? 'Hide details' : 'Details'}
          </button>
        )}
      </div>

      {details && evaluation && (
        <ul className="scorecard__details">
          {evaluation.items.map((item) => (
            <li key={item.key}>
              <span className={`dot dot--${item.level}`} aria-hidden="true" />
              <span>
                <strong>{item.label}{item.informative ? ' (for information, does not affect feasibility)' : ''}:</strong> {item.detail}{' '}
                {item.shiftMs != null && (
                  <button type="button" className="button button--small" onClick={() => onShiftLanding(item.shiftMs)}>
                    Move landing to the next window
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
