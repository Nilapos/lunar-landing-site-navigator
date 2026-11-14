import { useState } from 'react'
import { formatUtc } from '../lib/format.js'
import { dayTicks, STEP_UNITS, stepIndex } from '../lib/timelineTools.js'
import Icon from './Icon.jsx'

// The moment shared by every view: Play, step back / forward by an hour, a day or a week, a slider with day marks.
export default function TimelineBar({ timeline }) {
  const { samples, index, sky } = timeline
  const [unitKey, setUnitKey] = useState('hour')
  const unit = STEP_UNITS.find((u) => u.key === unitKey)
  const ticks = samples ? dayTicks(samples) : []
  const last = samples ? samples.length - 1 : 0
  const move = (direction) => timeline.setIndex(stepIndex(samples, index, unit.ms, direction))

  return (
    <div className="timeline" aria-label="Moment shown in the views">
      <div className="timeline__row">
        <button type="button" className="button timeline__play" disabled={!samples} onClick={timeline.togglePlay}>
          <Icon className="button__icon" name={timeline.playing ? 'pause' : 'play'} />
          {timeline.playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="button" disabled={!samples || index === 0} onClick={() => move(-1)} aria-label={`Back one ${unit.key}`}>
          <Icon className="button__icon" name="chevron-left" />
        </button>
        <button type="button" className="button" disabled={!samples || index === last} onClick={() => move(1)} aria-label={`Forward one ${unit.key}`}>
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
          </select>
        </label>
        <span className="timeline__clock">
          {samples ? formatUtc(Date.parse(samples[index].t)) : sky.error ? `Sky data: ${sky.error}` : 'Loading the Sun and Earth positions…'}
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
          {ticks.map((t) => (
            <span key={t.index} className="timeline__tick" style={{ left: `${(t.index / Math.max(last, 1)) * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
