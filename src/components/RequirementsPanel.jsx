const FIELDS = [
  { key: 'minSunDeg', label: 'Min Sun elevation', unit: '°', min: 0, max: 30, step: 0.5, help: 'Sun above the terrain horizon by at least this much' },
  { key: 'batteryHours', label: 'Battery autonomy', unit: 'h', min: 1, max: 720, step: 1, help: 'Longest darkness the rover survives' },
  { key: 'minEarthDeg', label: 'Min Earth elevation', unit: '°', min: 0, max: 30, step: 0.5, help: 'Antenna pointing limit above the terrain horizon' },
  { key: 'linkMinPerHour', label: 'Earth link needed', unit: 'min/h', min: 0, max: 60, step: 1, help: 'Direct-to-Earth time needed per hour' },
  { key: 'landingMinutes', label: 'Landing sequence', unit: 'min', min: 1, max: 600, step: 1, help: 'Sun and Earth both needed for this long after landing' },
]

// The rover's needs. They apply to both scenarios, so A and B are judged by the same rules.
export default function RequirementsPanel({ requirements, onChange, onReset }) {
  return (
    <section className="panel" aria-label="Mission requirements">
      <div className="requirements__head">
        <h2 className="panel__title">Mission requirements (rover)</h2>
        <button type="button" className="button" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="requirements">
        {FIELDS.map((f) => (
          <label key={f.key} className="requirements__field" title={f.help}>
            <span className="controls__label">
              {f.label} ({f.unit})
            </span>
            <input
              className="controls__input"
              type="number"
              min={f.min}
              max={f.max}
              step={f.step}
              value={requirements[f.key]}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v)) onChange({ [f.key]: Math.min(Math.max(v, f.min), f.max) })
              }}
            />
          </label>
        ))}
      </div>
      <p className="panel__detail">
        Green: requirement met. Orange: met but within 20% of the limit (landing window: shorter than 3 times the
        landing sequence). Red: not met.
      </p>
    </section>
  )
}
