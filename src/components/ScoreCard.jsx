import { useState } from 'react'
import { formatUtc } from '../lib/format.js'
import { causeText } from '../lib/polarSky.js'
import { scoreLevel } from '../lib/scores.js'
import { LEVEL_LABEL } from '../lib/verdict.js'

const GAUGES = [
  { key: 'solar', label: 'Solar' },
  { key: 'telecom', label: 'Telecom' },
  { key: 'window', label: 'Window' },
  { key: 'topography', label: 'Terrain' },
]

function BodyLine({ name, state }) {
  return (
    <p className={`scorecard__body scorecard__body--${state.visible ? 'ok' : 'fail'}`}>
      <span className="scorecard__dot" aria-hidden="true" />
      {causeText(name, state)}
    </p>
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
        <span className="scorecard__max">/100</span>
        {evaluation && <span className={`pill pill--${evaluation.overall}`}>{LEVEL_LABEL[evaluation.overall]}</span>}
      </div>
      <p className="scorecard__caption">{moved ? 'If we land at this moment' : 'Landing at the start of the period'}</p>

      {evaluation && (
        <ul className="gauges">
          {GAUGES.map((g) => (
            <li key={g.key} className="gauges__row" title={evaluation.items.find((i) => i.key === { solar: 'power', telecom: 'comms', window: 'window', topography: 'terrain' }[g.key])?.detail}>
              <span className="gauges__label">{g.label}</span>
              <span className="gauges__bar">
                <span className={`gauges__fill gauges__fill--${scoreLevel(evaluation.scores[g.key])}`} style={{ width: `${evaluation.scores[g.key]}%` }} />
              </span>
              <span className="gauges__value">{evaluation.scores[g.key]}</span>
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
                <strong>{item.label}:</strong> {item.detail}{' '}
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
