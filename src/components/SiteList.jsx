export default function SiteList({ sites, selectedId, onSelect }) {
  return (
    <aside className="sites" aria-label="Candidate landing sites">
      <h2 className="sites__title">Candidate sites</h2>
      <ul className="sites__list">
        {sites.map((site) => (
          <li key={site.id}>
            <button
              type="button"
              className={`sites__item${site.id === selectedId ? ' sites__item--selected' : ''}`}
              onClick={() => onSelect(site.id)}
            >
              <span className="sites__name">{site.name}</span>
              <span className="sites__score">{site.score.toFixed(0)}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
