import { useMemo, useState } from 'react'
import { formatUtc } from '../lib/format.js'
import { dayTicks, STEP_UNITS, stepIndex } from '../lib/timelineTools.js'
import Icon from './Icon.jsx'

const dayOf = (sample) => sample.t.slice(0, 10)

// The dates looked at, inside the period: the slider, the map layers and the best landing areas only use them.
function RangePicker({ timeline }) {
  const { allSamples, range } = timeline
  if (!allSamples) return null
  const first = dayOf(allSamples[0])
  const last = dayOf(allSamples[allSamples.length - 1])
  const from = range.from ?? first
  const to = range.to ?? last
  const whole = !range.from && !range.to
  const set = (patch) => {
    const next = { from, to, ...patch }
    // Keep the two dates in order: moving one past the other moves both.
    if (next.from > next.to) {
      if (patch.from) next.to = next.from
      else next.from = next.to
    }
    timeline.setRange({ from: next.from === first ? null : next.from, to: next.to === last ? null : next.to })
  }
  return (
    <div className="timeline__unit timeline__range" role="group" aria-label="Range of dates looked at">
      <span className="controls__label">Range</span>
      <input className="controls__input" type="date" min={first} max={last} value={from} onChange={(e) => e.target.value && set({ from: e.target.value })} aria-label="Range start (UT)" />
      <span aria-hidden="true">→</span>
      <input className="controls__input" type="date" min={first} max={last} value={to} onChange={(e) => e.target.value && set({ to: e.target.value })} aria-label="Range end (UT)" />
      {!whole && (
        <button type="button" className="link-button" onClick={() => timeline.setRange({})}>
          Whole period
        </button>
      )}
    </div>
  )
}

const FEASIBLE = { key: 'feasible', label: 'Feasible' }

// The moment shared by every view: Play, step back / forward by an hour, a day, a week or to the next / previous Feasible moment
// of the selected site, a range of dates, a slider with day marks.
//   feasible: { site, find(direction) -> index | null } or null while the site's data loads.
export default function TimelineBar({ timeline, feasible = null }) {
  const { samples, index, sky } = timeline
  const [unitKey, setUnitKey] = useState('hour')
  const [searching, setSearching] = useState(false)
  const [notice, setNotice] = useState(null) // { at: index, text }: shown until the moment changes
  const unit = unitKey === FEASIBLE.key ? FEASIBLE : STEP_UNITS.find((u) => u.key === unitKey)
  const last = samples ? samples.length - 1 : 0
  // The day marks only depend on the period: not rebuilt at every step of the timeline.
  const tickMarks = useMemo(
    () =>
      (samples ? dayTicks(samples) : []).map((t) => (
        <span key={t.index} className="timeline__tick" style={{ left: `${(t.index / Math.max(last, 1)) * 100}%` }}>
          {t.label}
        </span>
      )),
    [samples, last],
  )
  const move = (direction) => {
    if (unit.key !== FEASIBLE.key) {
      timeline.setIndex(stepIndex(samples, index, unit.ms, direction))
      return
    }
    // A search can take a second or two over a whole year: let the "Searching" state show first.
    setSearching(true)
    setTimeout(() => {
      const found = feasible.find(direction)
      setSearching(false)
      if (found === null) setNotice({ at: index, text: `No Feasible moment ${direction > 0 ? 'after' : 'before'} this one for ${feasible.site}` })
      else timeline.setIndex(found)
    }, 20)
  }
  const stepDisabled = !samples || searching || (unit.key === FEASIBLE.key && !feasible)
  const clockText = searching
    ? `Searching a Feasible moment for ${feasible.site}…`
    : notice && notice.at === index
      ? notice.text
      : null

  return (
    <div className="timeline" aria-label="Moment shown in the views">
      <div className="timeline__row">
        <button type="button" className="button timeline__play" disabled={!samples} onClick={timeline.togglePlay}>
          <Icon className="button__icon" name={timeline.playing ? 'pause' : 'play'} />
          {timeline.playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="button"
          disabled={stepDisabled || index === 0}
          onClick={() => move(-1)}
          aria-label={unit.key === FEASIBLE.key ? 'Previous Feasible moment' : `Back one ${unit.key}`}
        >
          <Icon className="button__icon" name="chevron-left" />
        </button>
        <button
          type="button"
          className="button"
          disabled={stepDisabled || index === last}
          onClick={() => move(1)}
          aria-label={unit.key === FEASIBLE.key ? 'Next Feasible moment' : `Forward one ${unit.key}`}
        >
          <Icon className="button__icon" name="chevron-right" />
        </button>
        <label className="timeline__unit">
          <span className="controls__label">Step</span>
          <select className="controls__input" value={unitKey} onChange={(e) => setUnitKey(e.target.value)}>
            {STEP_UNITS.map((u) => (
              <option key={u.key} value={u.key}>
                {u.label}
              </option>
            ))}
            <option value={FEASIBLE.key} title="Next or previous moment where landing at the selected site is Feasible">
              {FEASIBLE.label}
            </option>
          </select>
        </label>
        <RangePicker timeline={timeline} />
        <span className="timeline__clock">
          {clockText ?? (samples ? formatUtc(Date.parse(samples[index].t)) : sky.error ? `Sky data: ${sky.error}` : 'Loading the Sun and Earth positions…')}
        </span>
      </div>
      <div className="timeline__track">
        <input
          className="panel__slider"
          type="range"
          min="0"
          max={last}
          value={index}
          disabled={!samples}
          onChange={(e) => timeline.setIndex(Number(e.target.value))}
          aria-label="Moment shown in the views"
        />
        <div className="timeline__ticks" aria-hidden="true">
          {tickMarks}
        </div>
      </div>
    </div>
  )
}
