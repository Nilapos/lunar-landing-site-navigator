import { ANTENNAS } from '../lib/scores.js'

const FIELDS = [
  { key: 'minSunDeg', label: 'Min Sun elevation', unit: '°', min: 0, max: 30, step: 0.5, help: 'Sun above the terrain horizon by at least this much' },
  { key: 'batteryHours', label: 'Battery autonomy', unit: 'h', min: 1, max: 720, step: 1, help: 'Longest darkness the rover survives' },
  { key: 'minEarthDeg', label: 'Min Earth elevation', unit: '°', min: 0, max: 30, step: 0.5, help: 'Antenna pointing limit above the terrain horizon' },
  { key: 'linkMinPerHour', label: 'Earth link needed', unit: 'min/h', min: 0, max: 60, step: 1, help: 'Direct-to-Earth time needed per hour' },
  { key: 'bandwidthKbps', label: 'Data rate needed', unit: 'kbps', min: 0, max: 1000000, step: 1, help: 'Data rate the rover must send to Earth' },
  { key: 'landingMinutes', label: 'Landing sequence', unit: 'min', min: 1, max: 600, step: 1, help: 'Sun and Earth both needed for this long after landing' },
  { key: 'maxSlopeDeg', label: 'Landing slope', unit: '°', min: 0, max: 45, step: 0.5, help: 'Steepest slope the lander can land on' },
  { key: 'driveSlopeDeg', label: 'Rover drive slope', unit: '°', min: 0, max: 45, step: 0.5, help: 'Steepest slope the rover can drive (shown when the mission has a rover)' },
]

// The rover's needs. They apply to both scenarios, so A and B are judged by the same rules.
export default function RequirementsPanel({ requirements, onChange, onReset }) {
  return (
    <section className="panel" aria-label="Mission requirements">
      <div className="requirements__head">
        <h2 className="panel__title">Mission requirements</h2>
        <button type="button" className="button" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="requirements">
        {FIELDS.filter((f) => f.key !== 'driveSlopeDeg' || requirements.driveSlopeDeg != null).map((f) => (
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
        <label className="requirements__field" title="Antenna class: sets the data rate the link can carry">
          <span className="controls__label">Antenna</span>
          <select className="controls__input" value={requirements.antenna} onChange={(e) => onChange({ antenna: e.target.value })}>
            {Object.entries(ANTENNAS).map(([key, a]) => (
              <option key={key} value={key}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="panel__detail">
        <summary>How are the scores and colors computed?</summary>
        <p>
          For each requirement: ratio = what the site offers / what the rover needs. Score = 100 x min(ratio / 2, 1):
          50 means the requirement is just met, 100 means at least twice the margin. Green from ratio 1.2 (score 60),
          orange between 1 and 1.2, red below 1. The global score is the average of the four.
        </p>
        <ul>
          <li>Solar exposure: battery autonomy / longest darkness.</li>
          <li>Telecom: the lower of (Earth link time per hour / needed) and (antenna data rate / needed).</li>
          <li>Window duration: time Sun and Earth stay visible together after landing / landing sequence length.</li>
          <li>Topography: landing slope limit / steepest slope within 100 m (LOLA map, 20 m resolution, so features smaller than that are smoothed). With a rover, also its drive slope limit / the slope under which 90% of the ground within 500 m lies; the lower of the two counts.</li>
        </ul>
      </details>
    </section>
  )
}
