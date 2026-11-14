const EXAGGERATION = 6 // angles are small (a few degrees), so they are drawn this many times larger
const O = { x: 50, y: 150 }
const LENGTH = 300

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
const at = (deg, length) => {
  const a = (clamp(deg * EXAGGERATION, -40, 60) * Math.PI) / 180
  return { x: O.x + Math.cos(a) * length, y: O.y - Math.sin(a) * length }
}

// Side view for one body: the local horizontal, the terrain mask toward the body, the body's elevation.
function Panel({ name, state }) {
  const mask = at(state.horizon, LENGTH)
  const body = at(state.el, LENGTH * 0.82)
  const terrain = `M${O.x},${O.y} L${mask.x},${mask.y} L${O.x + LENGTH},${O.y + 150} L${O.x},${O.y + 150} Z`
  return (
    <svg className="ray__svg" viewBox="0 0 400 300" role="img" aria-label={`${name} against the terrain mask`}>
      <path className="ray__terrain" d={terrain} />
      <line className="ray__flat" x1={O.x} y1={O.y} x2={O.x + LENGTH} y2={O.y} />
      <line className="ray__mask" x1={O.x} y1={O.y} x2={mask.x} y2={mask.y} />
      <line className={`ray__sight ray__sight--${state.visible ? 'ok' : 'fail'}`} x1={O.x} y1={O.y} x2={body.x} y2={body.y} />
      <circle className={`ray__body ray__body--${name === 'Sun' ? 'sun' : 'earth'}`} cx={body.x} cy={body.y} r="11" />
      <circle className="ray__site" cx={O.x} cy={O.y} r="4" />
      <text className="chart__tick" x={O.x + LENGTH + 6} y={O.y + 4}>
        local horizontal
      </text>
      <text className="chart__tick" x={mask.x - 4} y={mask.y - 8} textAnchor="end">
        terrain {state.horizon >= 0 ? '+' : '−'}
        {Math.abs(state.horizon).toFixed(1)}°
      </text>
      <text className="chart__tick" x={body.x + 16} y={body.y + 4}>
        {name} {state.el >= 0 ? '+' : '−'}
        {Math.abs(state.el).toFixed(1)}°
      </text>
      <text className={`ray__mark ray__mark--${state.visible ? 'ok' : 'fail'}`} x="372" y="30" textAnchor="middle">
        {state.visible ? '✓' : '✗'}
      </text>
    </svg>
  )
}

// A schematic of the current moment, for both bodies, with the four steps of the reasoning.
// Angles are drawn exaggerated: the figure says so.
export default function RayDiagram({ sun, earth }) {
  return (
    <div className="ray">
      <div className="ray__panels">
        <Panel name="Sun" state={sun} />
        <Panel name="Earth" state={earth} />
      </div>
      <p className="panel__detail">Angles are drawn {EXAGGERATION} times larger than they are, to be readable. The ground is not to scale.</p>
      <ol className="ray__steps">
        <li>
          <strong>Place the site.</strong> The observer stands on the ground; the dashed line is the local horizontal.
        </li>
        <li>
          <strong>Find the bodies.</strong> The Sun and the Earth are at the elevations given by JPL Horizons.
        </li>
        <li>
          <strong>Read the terrain.</strong> In the direction of each body, the LOLA relief rises to the dark line (the terrain mask).
        </li>
        <li>
          <strong>Compare.</strong> A body is visible only if its elevation is above the mask (and above the minimum chosen for the rover).
        </li>
      </ol>
    </div>
  )
}
