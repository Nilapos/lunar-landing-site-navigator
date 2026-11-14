import { ARTEMIS_REGIONS_SOURCE, NINE_REGIONS_2024_SOURCE, artemisRegions, selectionCriteria } from '../data/artemis-regions.js'

// NASA's 13 Artemis III candidate regions, named with the teal labels of NASA's videos, and why they were chosen.
// Regions we can analyze are buttons: `onSelect(siteId)` opens them in scenario A.
export default function ArtemisRegions({ onSelect }) {
  return (
    <section className="panel regions" aria-label="Artemis III candidate landing regions">
      <div className="regions__head">
        <h2 className="panel__title">Artemis III candidate landing regions</h2>
        <p className="regions__lead">
          NASA identified <strong>13 regions</strong> near the lunar South Pole for the first crewed landing since 1972. Robotic
          orbiters and rovers keep studying them before NASA selects the Artemis III landing site; the list was narrowed to nine in
          October 2024.
        </p>
      </div>

      <ul className="regions__criteria">
        {selectionCriteria.map((c) => (
          <li key={c.title} className="regions__criterion">
            <span className="regions__criterion-title">{c.title}</span>
            <span className="regions__criterion-text">{c.text}</span>
          </li>
        ))}
      </ul>

      <ul className="regions__grid">
        {artemisRegions.map((r) => (
          <li key={r.name}>
            {r.siteId ? (
              <button
                type="button"
                className="region-tag region-tag--action"
                onClick={() => onSelect(r.siteId)}
                title={`Analyze ${r.name} (sets scenario A)`}
              >
                {r.name}
                <span className="region-tag__hint">Analyze</span>
              </button>
            ) : (
              <span className="region-tag region-tag--muted" title="No published coordinates in the sources we could open: not analyzed">
                {r.name}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="panel__detail regions__note">
        Moonwalk measures what the data can show for a region: sunlight for power, the Earth in view for a direct link, and the slopes.
        Bright tags are analyzed here; the others have no published coordinates in the sources we could open. Sources:{' '}
        <a href={ARTEMIS_REGIONS_SOURCE.url} target="_blank" rel="noreferrer">
          {ARTEMIS_REGIONS_SOURCE.label}
        </a>{' '}
        ·{' '}
        <a href={NINE_REGIONS_2024_SOURCE.url} target="_blank" rel="noreferrer">
          {NINE_REGIONS_2024_SOURCE.label}
        </a>
      </p>
    </section>
  )
}
