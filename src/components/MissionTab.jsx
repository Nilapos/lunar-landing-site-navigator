import { landerById, landers, missions, roverById, roversFor } from '../data/vehicles.js'
import { neededWhPerDay } from '../lib/energy.js'
import { requirementsFor } from '../lib/missionRequirements.js'
import { ANTENNAS } from '../lib/scores.js'

// What each requirement is, in the order shown, and who sets it.
const ROWS = [
  { key: 'maxSlopeDeg', label: 'Landing slope limit', unit: '°' },
  { key: 'landingMinutes', label: 'Landing sequence (Sun and Earth both)', unit: 'min' },
  { key: 'batteryHours', label: 'Survival through the darkness', unit: 'h' },
  { key: 'minSunDeg', label: 'Sun at least this high', unit: '°' },
  { key: 'antenna', label: 'Antenna', unit: '' },
  { key: 'bandwidthKbps', label: 'Data rate to send', unit: 'kbps' },
  { key: 'linkMinPerHour', label: 'Earth link needed', unit: 'min/h' },
  { key: 'minEarthDeg', label: 'Earth at least this high', unit: '°' },
  { key: 'driveSlopeDeg', label: 'Rover drive slope limit', unit: '°' },
]
const ORIGIN = { lander: 'lander', rover: 'rover', both: 'lander and rover' }

// Energy the mission must collect per day of 24 h (see neededWhPerDay in energy.js): the total of the vehicles with power specs, in kWh.
// Null when no vehicle has power specs.
function energyTotal(energy) {
  const parts = ['lander', 'rover']
    .filter((vehicle) => energy?.[vehicle])
    .map((vehicle) => ({ vehicle, kWh: neededWhPerDay(energy[vehicle].consumption) / 1000 }))
  if (parts.length === 0) return null
  return {
    kWh: parts.reduce((sum, p) => sum + p.kWh, 0),
    how: parts.map((p) => `${p.vehicle} ${p.kWh.toFixed(2)} kWh`).join(' + '),
  }
}

/**
 * The mission: a lander, with a rover or not (a rover only goes with a lander that can carry it). The requirements of the
 * analysis come from it (requirementsFor); the panel of the requirements (Settings) can still override single values.
 *   mission: { landerId, roverId };  onMission(patch);  requirements: the ones in use (mission + overrides);
 *   overrides: what was typed by hand;  onResetOverrides(): back to the mission's own numbers.
 */
export default function MissionTab({ mission, onMission, requirements, overrides, onResetOverrides }) {
  const lander = landerById(mission.landerId)
  const rover = roverById(mission.roverId)
  const { requirements: own, origin, status } = requirementsFor(lander, rover)
  const carried = roversFor(mission.landerId)
  const overridden = Object.keys(overrides)
  const energy = energyTotal(requirements.energy)

  return (
    <div className="stage__scroll mission">
      <header className="mission__head">
        <h2 className="panel__title">Mission</h2>
        <p className="panel__detail">
          A lander, with a rover or not (a rover cannot go without the lander that carries it). They set the requirements the sites are
          judged against. The catalog of vehicles will be filled in from sourced data.
        </p>
      </header>

      <section className="panel mission__choice" aria-label="Choose the vehicles">
        <label className="controls__field">
          <span className="controls__label">Lander</span>
          <select className="controls__input" value={mission.landerId} onChange={(e) => onMission({ landerId: e.target.value })}>
            {landers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="controls__field">
          <span className="controls__label">Rover carried</span>
          <select
            className="controls__input"
            value={mission.roverId ?? ''}
            disabled={carried.length === 0}
            onChange={(e) => onMission({ roverId: e.target.value || null })}
          >
            <option value="">{carried.length === 0 ? 'None (this lander carries no rover)' : 'No rover'}</option>
            {carried.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mission__presets" role="group" aria-label="Preset missions">
          <span className="controls__label">Presets</span>
          {missions.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`button button--small${m.landerId === mission.landerId && m.roverId === mission.roverId ? ' button--active' : ''}`}
              title={m.note}
              onClick={() => onMission({ landerId: m.landerId, roverId: m.roverId })}
            >
              {m.name}
            </button>
          ))}
        </div>
      </section>

      {status === 'hypothesis' && (
        <p className="notice">
          Hypothesis: the numbers of this mission are not sourced yet. They are placeholders until the catalog is filled in.
        </p>
      )}

      <section className="panel" aria-label="Requirements of this mission">
        <h3 className="panel__title">Requirements of this mission</h3>
        <table className="compare mission__table">
          <thead>
            <tr>
              <th scope="col">Requirement</th>
              <th scope="col">Value</th>
              <th scope="col">System</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.filter((r) => requirements[r.key] != null).map((r) => {
              const value = requirements[r.key]
              const changed = Object.hasOwn(overrides, r.key)
              return (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td>
                    {r.key === 'antenna' ? ANTENNAS[value].label : `${value}${r.unit ? ` ${r.unit}` : ''}`}
                    {changed && <span className="mission__changed" title={`The mission says ${own[r.key]}`}> (changed by hand)</span>}
                  </td>
                  <td>{ORIGIN[origin[r.key]]}</td>
                </tr>
              )
            })}
            {energy && (
              <tr>
                <th scope="row">Energy to collect per day</th>
                <td title={energy.how}>{energy.kWh.toFixed(2)} kWh</td>
                <td>battery</td>
              </tr>
            )}
          </tbody>
        </table>
        {overridden.length > 0 && (
          <p className="panel__detail">
            {overridden.length} value{overridden.length > 1 ? 's' : ''} changed by hand in Settings.{' '}
            <button type="button" className="link-button" onClick={onResetOverrides}>
              Back to the mission&apos;s numbers
            </button>
          </p>
        )}
      </section>

      <section className="panel mission__vehicles" aria-label="The vehicles">
        {[lander, rover].filter(Boolean).map((v) => (
          <div key={v.id} className="mission__vehicle">
            <h3 className="panel__title">
              {v.name} <span className={`pill pill--${v.status === 'sourced' ? 'ok' : 'warn'}`}>{v.status === 'sourced' ? 'Sourced' : 'Hypothesis'}</span>
            </h3>
            <p className="panel__detail">{v.note}</p>
            {v.sources.length > 0 && (
              <p className="panel__detail">
                Sources:{' '}
                {v.sources.map((s, i) => (
                  <span key={s.url}>
                    {i > 0 && ' · '}
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.label}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
