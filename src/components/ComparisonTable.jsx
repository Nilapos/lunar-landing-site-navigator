import { formatDuration } from '../lib/format.js'

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

// A versus B on the same metrics. The better value of each row is highlighted.
export default function ComparisonTable({ rows, labelA, labelB }) {
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
