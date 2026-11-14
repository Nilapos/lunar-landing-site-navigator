import { LEVEL_LABEL } from '../lib/verdict.js'

export function VerdictPill({ level }) {
  return <span className={`pill pill--${level}`}>{LEVEL_LABEL[level]}</span>
}

// Overall verdict and one line per requirement (power, communication, landing window).
export default function Verdict({ evaluation }) {
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
              <strong>{item.label}:</strong> {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
