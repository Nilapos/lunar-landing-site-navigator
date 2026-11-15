import { formatDuration } from '../lib/format.js'
import { LEVEL_LABEL } from '../lib/verdict.js'
import { VerdictPill } from './Verdict.jsx'

function formatValue(kind, value) {
  return kind === 'percent' ? `${Math.round(value * 100)} %` : formatDuration(value)
}

function formatDelta(kind, delta) {
  if (kind === 'percent') {
    const points = Math.round(delta * 100)
    return points === 0 ? '=' : `${points > 0 ? '+' : '-'}${Math.abs(points)} pts`
  }
  return Math.abs(delta) < 60000 ? '=' : `${delta > 0 ? '+' : '-'}${formatDuration(Math.abs(delta))}`
}

const levelOf = (evaluation, key) =>
  key === 'overall' ? evaluation.overall : evaluation.items.find((i) => i.key === key).level

const VERDICT_ROWS = [
  ['overall', 'Overall'],
  ['power', 'Night endurance'],
  ['comms', 'Communication'],
  ['window', 'Landing window'],
  ['terrain', 'Terrain'],
]

const SCORE_ROWS = [
  ['global', 'Global score'],
  ['solar', 'Night endurance'],
  ['telecom', 'Telecom'],
  ['window', 'Window duration'],
  ['topography', 'Topography'],
]

// A versus B: verdicts (green / orange / red) first, then the measured values. The better value is highlighted.
export default function ComparisonTable({ rows, labelA, labelB, evalA, evalB }) {
  return (
    <section className="panel" aria-label="Comparison of scenarios A and B">
      <h2 className="panel__title">A versus B</h2>
      <div className="compare__scroll">
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">{labelA}</th>
              <th scope="col">{labelB}</th>
              <th scope="col">Change (B - A)</th>
            </tr>
          </thead>
          <tbody>
            {VERDICT_ROWS.map(([key, label]) => {
              const a = levelOf(evalA, key)
              const b = levelOf(evalB, key)
              return (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>
                    <VerdictPill level={a} />
                  </td>
                  <td>
                    <VerdictPill level={b} />
                  </td>
                  <td className="compare__delta">{a === b ? '=' : `${LEVEL_LABEL[a]} → ${LEVEL_LABEL[b]}`}</td>
                </tr>
              )
            })}
            {SCORE_ROWS.map(([key, label]) => {
              const a = evalA.scores[key]
              const b = evalB.scores[key]
              return (
                <tr key={`score-${key}`}>
                  <th scope="row">{label} (% of the need)</th>
                  <td className={a > b ? 'compare__better' : ''}>{a}</td>
                  <td className={b > a ? 'compare__better' : ''}>{b}</td>
                  <td className="compare__delta">{a === b ? '=' : `${b > a ? '+' : '-'}${Math.abs(b - a)}`}</td>
                </tr>
              )
            })}
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td className={r.better === 'a' ? 'compare__better' : ''}>{formatValue(r.kind, r.a)}</td>
                <td className={r.better === 'b' ? 'compare__better' : ''}>{formatValue(r.kind, r.b)}</td>
                <td className="compare__delta">{formatDelta(r.kind, r.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
