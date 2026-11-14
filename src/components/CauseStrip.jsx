import { CAUSE_LABEL, causeSegments } from '../lib/cause.js'
import { formatDuration, formatUtc } from '../lib/format.js'

const NAMES = { sun: 'Sun', earth: 'Earth' }

// "Visible until the end of the period" / "Hidden by terrain, back in 3 h 10 min".
function nextChange(state, cause) {
  const word = cause === 'visible' ? 'Visible' : CAUSE_LABEL[cause]
  if (state.remainingMs === null) return `${word} until the end of the period`
  return `${word}, ${state.visible ? 'sets' : 'rises'} in ${formatDuration(state.remainingMs)}`
}

// For the Sun and for the Earth, a bar over the period colored by cause, with a cursor on the current moment.
// `states` = { sun, earth } from stateAt (visibility.js), for the label of the next change.
export default function CauseStrip({ series, profile, minDeg, atMs, states, nowCauses }) {
  const first = Date.parse(series[0].t)
  const last = Date.parse(series[series.length - 1].t)
  const pos = (ms) => `${((ms - first) / Math.max(last - first, 1)) * 100}%`
  return (
    <div className="causes">
      {['sun', 'earth'].map((body) => (
        <div key={body} className="causes__row">
          <div className="causes__head">
            <strong>{NAMES[body]}</strong>
            <span className={`causes__now causes__now--${nowCauses[body]}`}>{nextChange(states[body], nowCauses[body])}</span>
          </div>
          <div
            className="causes__bar"
            role="img"
            aria-label={`${NAMES[body]} visibility over the period, colored by cause`}
          >
            {causeSegments(series, body, profile, minDeg[body]).map((s) => (
              <span
                key={`${s.start}-${s.cause}`}
                className={`causes__seg causes__seg--${s.cause}`}
                style={{ left: pos(s.start), width: `calc(${pos(s.end)} - ${pos(s.start)})` }}
                title={`${CAUSE_LABEL[s.cause]}: ${formatUtc(s.start)} to ${formatUtc(s.end)}`}
              />
            ))}
            <span className="causes__cursor" style={{ left: pos(atMs) }} />
          </div>
        </div>
      ))}
      <div className="causes__legend">
        <span className="causes__key causes__key--visible">Visible</span>
        <span className="causes__key causes__key--terrain">Hidden by terrain (above the flat horizon)</span>
        <span className="causes__key causes__key--below">Below the flat horizon (night / Earth set)</span>
      </div>
    </div>
  )
}
