import { landerById, landers, missions, roverById, roversFor, originText, solarInputs, solarSpec, valueOrigin } from '../data/vehicles.js'
import { requirementsFor } from '../lib/missionRequirements.js'
import { ANTENNAS } from '../lib/scores.js'
import NumberField from './NumberField.jsx'
import OriginMark from './OriginMark.jsx'

// What each requirement is, in the order shown, and the range a typed value is kept in (same as Settings).
const ROWS = [
  { key: 'maxSlopeDeg', label: 'Landing slope limit', unit: '°', min: 0, max: 45, step: 0.5 },
  { key: 'landingMinutes', label: 'Landing sequence (Sun and Earth both)', unit: 'min', min: 1, max: 600, step: 1 },
  { key: 'batteryHours', label: 'Survival through the darkness', unit: 'h', min: 1, max: 720, step: 1 },
  { key: 'minSunDeg', label: 'Sun at least this high', unit: '°', min: 0, max: 30, step: 0.5 },
  { key: 'antenna', label: 'Antenna', unit: '' },
  { key: 'bandwidthKbps', label: 'Data rate to send', unit: 'kbps', min: 0, max: 1000000, step: 1 },
  { key: 'linkMinPerHour', label: 'Earth link needed', unit: 'min/h', min: 0, max: 60, step: 1 },
  { key: 'minEarthDeg', label: 'Earth at least this high', unit: '°', min: 0, max: 30, step: 0.5 },
  { key: 'driveSlopeDeg', label: 'Rover drive slope limit', unit: '°', min: 0, max: 45, step: 0.5 },
]
const ORIGIN = { lander: 'lander', rover: 'rover', both: 'lander and rover' }

// The three numbers of each vehicle's energy balance (see solarSpec in vehicles.js). Efficiency is kept 0..1 and shown in %.
const ENERGY_FIELDS = [
  { key: 'panelAreaM2', label: 'Solar panel area', unit: 'm²', min: 0, max: 100, step: 0.01, scale: 1 },
  { key: 'panelEfficiency', label: 'Panel efficiency', unit: '%', min: 1, max: 100, step: 0.5, scale: 100 },
  { key: 'dailyNeedKWh', label: 'Energy to collect per day', unit: 'kWh', min: 0, max: 1000, step: 0.01, scale: 1 },
]

// The numbers of each vehicle that the requirements use, for the count of published / estimated / reference values.
const LANDER_KEYS = ['maxSlopeDeg', 'landingMinutes', 'batteryHours', 'minSunDeg', 'antenna', 'bandwidthKbps', 'linkMinPerHour', 'minEarthDeg']
const ROVER_KEYS = ['driveSlopeDeg', 'batteryHours', 'minSunDeg']
const RANK = { published: 0, estimate: 1, reference: 2 }

const round2 = (v) => Math.round(v * 100) / 100

/** Where a requirement comes from: the origin of the vehicle that sets it; when both agree, the better documented one. */
function requirementOrigin(key, who, lander, rover) {
  const vehicles = who === 'rover' ? [rover] : who === 'both' ? [lander, rover] : [lander]
  return vehicles.map((v) => valueOrigin(v, key)).sort((x, y) => RANK[x.origin] - RANK[y.origin])[0]
}

function countOrigins(vehicles) {
  const count = { published: 0, estimate: 0, reference: 0 }
  for (const { vehicle, keys } of vehicles) {
    const all = vehicle.power.energy ? [...keys, ...ENERGY_FIELDS.map((f) => f.key)] : keys
    for (const key of all) count[valueOrigin(vehicle, key).origin]++
  }
  return count
}

/** A spec with one of the three energy numbers changed; the other numbers of the spec stay as they are. */
function withEnergyInput(spec, key, value) {
  if (key !== 'dailyNeedKWh') return { ...spec, [key]: value }
  return { ...spec, consumption: solarSpec({ ...solarInputs(spec), dailyNeedKWh: value }).consumption }
}

const formatFact = (value, unit) => (value == null ? 'not published' : `${value.toLocaleString('en-US')} ${unit}`)

/** The facts of a vehicle that the analysis does not use, with their origin. */
function factsOf(vehicle, isRover) {
  if (vehicle.status === 'hypothesis') return []
  const facts = isRover
    ? [
        { key: 'massKg', label: 'Mass', text: formatFact(vehicle.massKg, 'kg') },
        vehicle.power.energy?.batteryWh && { key: 'batteryWh', label: 'Battery', text: `${round2(vehicle.power.energy.batteryWh / 1000)} kWh` },
      ]
    : [
        { key: 'payloadCapacityKg', label: 'Payload', text: formatFact(vehicle.payloadCapacityKg, 'kg') },
        vehicle.landing.ellipseM && { key: 'ellipseM', label: 'Landing accuracy', text: `${vehicle.landing.ellipseM} m` },
      ]
  return facts.filter(Boolean)
}

/**
 * The mission: a lander, with a rover or not (a rover only goes with a lander that can carry it). The requirements of the
 * analysis come from it (requirementsFor); every number can be typed in here or in Settings (overrides), and shows where it comes from.
 *   mission: { landerId, roverId };  onMission(patch);  requirements: the ones in use (mission + overrides);
 *   overrides: what was typed by hand;  onOverride(patch): type values by hand;  onResetOverrides(): back to the mission's own numbers.
 */
export default function MissionTab({ mission, onMission, requirements, overrides, onOverride, onResetOverrides }) {
  const lander = landerById(mission.landerId)
  const rover = roverById(mission.roverId)
  const { requirements: own, origin, status } = requirementsFor(lander, rover)
  const carried = roversFor(mission.landerId)
  const overridden = Object.keys(overrides)
  const vehicles = [
    { role: 'lander', vehicle: lander, keys: LANDER_KEYS },
    ...(rover ? [{ role: 'rover', vehicle: rover, keys: ROVER_KEYS }] : []),
  ]
  const count = countOrigins(vehicles)

  // Energy of each vehicle with power specs: the numbers in use (typed ones included) and the vehicle's own.
  const energyOf = (role) => {
    const spec = requirements.energy?.[role]
    const ownSpec = own.energy?.[role]
    return spec && ownSpec ? { spec, inputs: solarInputs(spec), own: solarInputs(ownSpec) } : null
  }
  const energyParts = vehicles.map((v) => ({ ...v, energy: energyOf(v.role) })).filter((v) => v.energy)
  const energyTotal = energyParts.reduce((sum, p) => sum + p.energy.inputs.dailyNeedKWh, 0)
  const energyEdited = energyParts.some((p) => round2(p.energy.inputs.dailyNeedKWh) !== round2(p.energy.own.dailyNeedKWh))
  const energyOrigin = energyParts
    .map((p) => valueOrigin(p.vehicle, 'dailyNeedKWh'))
    .sort((x, y) => RANK[y.origin] - RANK[x.origin])[0]
  const setEnergy = (role, key, value) => onOverride({ energy: { ...requirements.energy, [role]: withEnergyInput(requirements.energy[role], key, value) } })

  return (
    <div className="stage__scroll mission">
      <header className="mission__head">
        <h2 className="panel__title">Mission</h2>
        <p className="panel__detail">
          A lander, with a rover or not (a rover cannot go without the lander that carries it). Their numbers set the requirements the sites
          are judged against. Every number can be changed, and says where it comes from.
        </p>
      </header>

      <section className="panel mission__choice" aria-label="Choose the vehicles">
        <label className="controls__field">
          <span className="controls__label">Lander</span>
          <select className="controls__input" value={mission.landerId} onChange={(e) => onMission({ landerId: e.target.value })}>
            {landers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.agency === 'none' ? l.name : `${l.name} (${l.agency})`}
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
                {r.agency === 'none' ? r.name : `${r.name} (${r.agency})`}
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

      <section className="panel mission__quality" aria-label="Where the numbers come from">
        <p className="mission__count">
          <span className="mission__count-item mission__count-item--published">
            <strong>{count.published}</strong> published
          </span>
          <span className="mission__count-item mission__count-item--estimate">
            <strong>{count.estimate}</strong> estimated
          </span>
          <span className="mission__count-item mission__count-item--reference">
            <strong>{count.reference}</strong> reference
          </span>
        </p>
        <p className="panel__detail">
          Published: an official figure of the maker or of NASA. <span className="origin origin--estimate">≈ Estimate</span> worked out from a
          documented figure. <span className="origin origin--reference">◇ Reference</span> nothing documented: a default value. Hover a number
          or a mark to see where it comes from.
        </p>
        {status === 'hypothesis' && (
          <p className="notice">Hypothesis: this mission uses a placeholder vehicle. Its numbers are illustrative, not sourced.</p>
        )}
      </section>

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
              const where = requirementOrigin(r.key, origin[r.key], lander, rover)
              const changed = Object.hasOwn(overrides, r.key) && overrides[r.key] !== own[r.key]
              const vehicleSays = `The mission says ${r.key === 'antenna' ? ANTENNAS[own[r.key]].label : `${own[r.key]} ${r.unit}`}.`
              return (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td>
                    <span className="mission__value">
                      {r.key === 'antenna' ? (
                        <select
                          className="controls__input mission__input"
                          aria-label={r.label}
                          title={originText(where)}
                          value={value}
                          onChange={(e) => onOverride({ antenna: e.target.value })}
                        >
                          {Object.entries(ANTENNAS).map(([key, a]) => (
                            <option key={key} value={key}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <NumberField
                            className="controls__input mission__input"
                            label={`${r.label} (${r.unit})`}
                            title={originText(where)}
                            value={value}
                            min={r.min}
                            max={r.max}
                            step={r.step}
                            onChange={(v) => onOverride({ [r.key]: v })}
                          />
                          <span className="mission__unit">{r.unit}</span>
                        </>
                      )}
                      <OriginMark origin={where} edited={changed} editedFrom={vehicleSays} />
                    </span>
                  </td>
                  <td>{ORIGIN[origin[r.key]]}</td>
                </tr>
              )
            })}
            {energyParts.length > 0 && (
              <tr>
                <th scope="row">Energy to collect per day</th>
                <td>
                  <span className="mission__value" title={energyParts.map((p) => `${p.role} ${round2(p.energy.inputs.dailyNeedKWh)} kWh`).join(' + ')}>
                    {energyTotal.toFixed(2)} kWh
                    <OriginMark origin={energyOrigin} edited={energyEdited} editedFrom="Change it in the vehicle cards below." />
                  </span>
                </td>
                <td>battery</td>
              </tr>
            )}
          </tbody>
        </table>
        {overridden.length > 0 && (
          <p className="panel__detail">
            {overridden.length} value{overridden.length > 1 ? 's' : ''} changed by hand.{' '}
            <button type="button" className="link-button" onClick={onResetOverrides}>
              Back to the mission&apos;s numbers
            </button>
          </p>
        )}
      </section>

      <section className="mission__vehicles" aria-label="The vehicles">
        {vehicles.map(({ role, vehicle }) => {
          const energy = energyOf(role)
          const facts = factsOf(vehicle, role === 'rover')
          return (
            <article key={vehicle.id} className="panel mission__vehicle">
              <h3 className="panel__title mission__vehicle-title">
                <span>
                  {vehicle.name}
                  {vehicle.agency !== 'none' && <span className="mission__agency"> · {vehicle.agency}</span>}
                </span>
                <span className={`pill pill--${vehicle.status === 'sourced' ? 'ok' : 'warn'}`}>{vehicle.status === 'sourced' ? 'Sourced' : 'Hypothesis'}</span>
              </h3>
              <p className="panel__detail">{vehicle.note}</p>

              {facts.length > 0 && (
                <dl className="mission__facts">
                  {facts.map((f) => {
                    const where = valueOrigin(vehicle, f.key)
                    return (
                      <div key={f.key} className="mission__fact" title={originText(where)}>
                        <dt>{f.label}</dt>
                        <dd>
                          {f.text} <OriginMark origin={where} />
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              )}

              <h4 className="mission__subtitle">Solar energy</h4>
              {energy ? (
                <div className="mission__energy">
                  {ENERGY_FIELDS.map((f) => {
                    const where = valueOrigin(vehicle, f.key)
                    const shown = round2(energy.inputs[f.key] * f.scale)
                    const ownShown = round2(energy.own[f.key] * f.scale)
                    return (
                      <label key={f.key} className="mission__energy-field">
                        <span className="controls__label">
                          {f.label} ({f.unit})
                        </span>
                        <span className="mission__value">
                          <NumberField
                            className="controls__input mission__input"
                            label={`${vehicle.name}: ${f.label} (${f.unit})`}
                            title={originText(where)}
                            value={shown}
                            min={f.min}
                            max={f.max}
                            step={f.step}
                            onChange={(v) => setEnergy(role, f.key, v / f.scale)}
                          />
                          <OriginMark origin={where} edited={shown !== ownShown} editedFrom={`The vehicle says ${ownShown} ${f.unit}.`} />
                        </span>
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="panel__detail">{vehicle.energyNote ?? 'No power specs: no energy balance for this vehicle.'}</p>
              )}

              {vehicle.sources.length > 0 && (
                <p className="panel__detail mission__sources">
                  Sources:{' '}
                  {vehicle.sources.map((s, i) => (
                    <span key={s.url}>
                      {i > 0 && ' · '}
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.label}
                      </a>
                    </span>
                  ))}
                </p>
              )}
            </article>
          )
        })}
      </section>
    </div>
  )
}
