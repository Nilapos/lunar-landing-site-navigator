import { missions } from '../data/missions.js'

// Pill color class per status: green = success, orange = partial, red = failed or cancelled, neutral = planned.
const STATUS = {
  success: { label: 'Soft landing', cls: 'ok' },
  landed: { label: 'Landed, tipped over', cls: 'warn' },
  impact: { label: 'Crashed', cls: 'fail' },
  cancelled: { label: 'Cancelled', cls: 'fail' },
  planned: { label: 'Planned', cls: 'neutral' },
  delayed: { label: 'Planned, delayed', cls: 'neutral' },
  orbit: { label: 'Earth-orbit test, no landing', cls: 'neutral' },
}

function coords(m) {
  if (m.lat === null) return 'No published coordinates found'
  const place = `${Math.abs(m.lat).toFixed(3)}° S, ${m.lon.toFixed(3)}° E`
  return m.lat > -80 ? `${place} (outside the analyzed area, north of 80° S)` : place
}

// Missions to the south polar region, recent and planned, each with its sources.
// `onSelectSite(id)` opens an analyzable site in scenario A.
export default function MissionHistory({ onSelectSite }) {
  return (
    <section className="panel" aria-label="Mission history">
      <h2 className="panel__title">Mission history (south polar region)</h2>
      <ul className="missions">
        {missions.map((m) => (
          <li key={m.id} className="missions__item">
            <div className="missions__head">
              <strong>{m.name}</strong>
              <span className={`pill pill--${STATUS[m.status].cls}`}>{STATUS[m.status].label}</span>
            </div>
            <p className="missions__meta">
              {m.agency} · {m.when}
            </p>
            <p className="missions__meta">{coords(m)}</p>
            <p className="missions__note">{m.note}</p>
            <p className="missions__links">
              {m.siteId && (
                <button type="button" className="button button--small" onClick={() => onSelectSite(m.siteId)}>
                  Analyze this site
                </button>
              )}{' '}
              {m.sources.map((src, i) => (
                <span key={src.url}>
                  {i > 0 && ' · '}
                  <a href={src.url} target="_blank" rel="noreferrer">
                    {src.label}
                  </a>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
      <p className="panel__detail">
        Apollo missions landed far from the pole and are not listed. Dates and statuses checked on 14 November 2026
        from public sources: confirm before presenting them.
      </p>
    </section>
  )
}
