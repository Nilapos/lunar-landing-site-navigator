import { LEVEL_LABEL } from '../lib/verdict.js'

export function VerdictPill({ level }) {
  return <span className={`pill pill--${level}`}>{LEVEL_LABEL[level]}</span>
}

// Overall verdict and one line per requirement (power, communication, landing window, terrain).
// If the landing window is missed but a later one exists, a button moves the landing to it.
export default function Verdict({ evaluation, onShiftLanding }) {
  return (
    <section className={`verdict verdict--${evaluation.overall}`} aria-label="Feasibility">
      <div className="verdict__head">
        <h3 className="verdict__title">Feasibility</h3>
        <VerdictPill level={evaluation.overall} />
      </div>
      <ul className="verdict__list">
        {evaluation.items.map((item) => (
          <li key={item.key} className="verdict__item">
            <span className={`dot dot--${item.level}`} aria-hidden="true" />
            <span>
              <strong>{item.label}{item.informative ? ' (for information, does not affect feasibility)' : ''}:</strong> {item.detail}{' '}
              {item.shiftMs != null && onShiftLanding && (
                <button type="button" className="button button--small" onClick={() => onShiftLanding(item.shiftMs)}>
                  Move landing to the next window
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
