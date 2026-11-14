// One card per body (Sun for power, Earth for communication). `status` is the countdown badge.
export default function MetricCard({ tone, title, subtitle, status, visible, stats }) {
  return (
    <article className={`metric metric--${tone}`}>
      <h2 className="metric__title">{title}</h2>
      <p className="metric__subtitle">{subtitle}</p>
      <p className={`metric__status${visible ? ' metric__status--on' : ' metric__status--off'}`}>
        <span className={`dot ${visible ? 'dot--ok' : 'dot--fail'}`} aria-hidden="true" />
        {status}
      </p>
      <dl className="metric__stats">
        {stats.map((s) => (
          <div key={s.label} className="metric__stat">
            <dt className="metric__stat-label">{s.label}</dt>
            <dd className="metric__stat-value">{s.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
