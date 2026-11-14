const DURATIONS = [15, 30, 60]

export default function SiteControls({ sites, siteId, onSiteChange, start, onStartChange, days, onDaysChange }) {
  const site = sites.find((s) => s.id === siteId)
  return (
    <section className="controls" aria-label="Site and dates">
      <label className="controls__field">
        <span className="controls__label">Site</span>
        <select className="controls__input" value={siteId} onChange={(e) => onSiteChange(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="controls__field">
        <span className="controls__label">Start date (UT)</span>
        <input className="controls__input" type="date" value={start} onChange={(e) => onStartChange(e.target.value)} />
      </label>
      <label className="controls__field">
        <span className="controls__label">Period</span>
        <select className="controls__input" value={days} onChange={(e) => onDaysChange(Number(e.target.value))}>
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
