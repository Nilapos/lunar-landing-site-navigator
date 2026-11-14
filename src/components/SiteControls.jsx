import { SITE_GROUPS } from '../data/south-pole-sites.js'

const DURATIONS = [7, 15, 30, 60]

// `custom`: a point the user selected on the map (pointSite.js), offered as an extra choice while it is selected.
export default function SiteControls({ title, sites, state, onChange, custom = null }) {
  const site = custom && custom.id === state.siteId ? custom : sites.find((s) => s.id === state.siteId)
  return (
    <section className="controls" aria-label={title ? `${title}: site and dates` : 'Site and dates'}>
      {title && <h2 className="controls__title">{title}</h2>}
      <label className="controls__field controls__field--wide">
        <span className="controls__label">Site</span>
        <select className="controls__input" value={state.siteId} onChange={(e) => onChange({ siteId: e.target.value })}>
          {custom && (
            <option value={custom.id}>{custom.name}</option>
          )}
          {SITE_GROUPS.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {sites
                .filter((s) => s.group === g.key)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="controls__field">
        <span className="controls__label">Landing date and time (UT)</span>
        <input
          className="controls__input"
          type="datetime-local"
          value={state.start}
          onChange={(e) => onChange({ start: e.target.value })}
        />
      </label>
      <label className="controls__field">
        <span className="controls__label">Period after landing</span>
        <select className="controls__input" value={state.days} onChange={(e) => onChange({ days: Number(e.target.value) })}>
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </label>
      <div className="controls__site">
        <p className="controls__coords">
          {Math.abs(site.lat).toFixed(3)}° S, {site.lon.toFixed(3)}° E
        </p>
        <p className="controls__note">{site.note}</p>
        <p className="controls__sources">
          Sources:{' '}
          {site.sources.map((src, i) => (
            <span key={src.url}>
              {i > 0 && ' · '}
              <a href={src.url} target="_blank" rel="noreferrer">
                {src.label}
              </a>
            </span>
          ))}
        </p>
      </div>
    </section>
  )
}
