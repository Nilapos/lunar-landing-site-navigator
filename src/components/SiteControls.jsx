const DURATIONS = [7, 15, 30, 60]

export default function SiteControls({ title, sites, state, onChange }) {
  const site = sites.find((s) => s.id === state.siteId)
  return (
    <section className="controls" aria-label={title ? `${title}: site and dates` : 'Site and dates'}>
      {title && <h2 className="controls__title">{title}</h2>}
      <label className="controls__field controls__field--wide">
        <span className="controls__label">Site</span>
        <select className="controls__input" value={state.siteId} onChange={(e) => onChange({ siteId: e.target.value })}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="controls__field">
        <span className="controls__label">Landing date (UT)</span>
        <input className="controls__input" type="date" value={state.start} onChange={(e) => onChange({ start: e.target.value })} />
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
      <p className="controls__site">
        {site.lat.toFixed(3)}° , {site.lon.toFixed(3)}° E. {site.source}
      </p>
    </section>
  )
}
