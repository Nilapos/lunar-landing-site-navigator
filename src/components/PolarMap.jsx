import { circleRadius, projectToMap } from '../lib/polarMap.js'
import { scoreLevel } from '../lib/scores.js'
import { LEVEL_LABEL } from '../lib/verdict.js'

// Label placement for the sites crowded around the pole (dx, dy in drawing units; anchor = text-anchor).
const LABEL_OFFSETS = {
  'shackleton-floor': { dx: -13, dy: 16, anchor: 'end' },
  'change7-target': { dx: 13, dy: 17, anchor: 'start' },
  'shackleton-ridge': { dx: -13, dy: -8, anchor: 'end' },
}
const DEFAULT_OFFSET = { dx: 13, dy: 4, anchor: 'start' }

const SIZE = 640 // drawing units (the SVG scales to any width)
const LAT_CIRCLES = [-88, -86, -84, -82]
const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315]
const spokeLabel = (lon) => (lon === 0 ? '0°' : lon === 180 ? '180°' : lon < 180 ? `${lon}°E` : `${360 - lon}°W`)

// Marker shape per group: circle = Artemis III region, diamond = mission site, triangle = reference point.
function Shape({ group, r }) {
  if (group === 'mission') return <path d={`M0 ${-r * 1.3} L${r * 1.3} 0 L0 ${r * 1.3} L${-r * 1.3} 0 Z`} />
  if (group === 'reference') return <path d={`M0 ${-r * 1.3} L${r * 1.2} ${r} L${-r * 1.2} ${r} Z`} />
  return <circle r={r} />
}

// Hillshaded map of the south polar region (LOLA) with the sites on it, colored by feasibility.
// `items` come from useSitesOverview; `selected` maps a scenario label (A, B) to its site id.
export default function PolarMap({ items, selected, onSelect }) {
  const px = (frac) => frac * SIZE
  return (
    <figure className="polar">
      <svg className="polar__svg" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Map of the lunar south pole with candidate sites">
        <image href="/south-pole-hillshade.png" width={SIZE} height={SIZE} />

        {LAT_CIRCLES.map((lat) => (
          <g key={lat}>
            <circle className="polar__grid" cx={SIZE / 2} cy={SIZE / 2} r={px(circleRadius(lat))} />
            <text className="polar__tick" x={SIZE / 2 + 4} y={SIZE / 2 - px(circleRadius(lat)) + 11}>
              {Math.abs(lat)}°S
            </text>
          </g>
        ))}
        {SPOKES.map((lon) => {
          const edge = projectToMap(-80, lon)
          const label = projectToMap(-80.9, lon)
          return (
            <g key={lon}>
              <line className="polar__grid" x1={SIZE / 2} y1={SIZE / 2} x2={px(edge.x)} y2={px(edge.y)} />
              <text className="polar__tick polar__tick--edge" x={px(label.x)} y={px(label.y)} textAnchor="middle" dominantBaseline="middle">
                {spokeLabel(lon)}
              </text>
            </g>
          )
        })}

        {items.map(({ site, evaluation }) => {
          const { x, y } = projectToMap(site.lat, site.lon)
          // Marker color = level of the global score (green from 60, orange from 50, red below).
          const level = evaluation ? scoreLevel(evaluation.scores.global) : 'unknown'
          const labels = Object.entries(selected).filter(([, id]) => id === site.id).map(([label]) => label)
          const offset = LABEL_OFFSETS[site.id] ?? DEFAULT_OFFSET
          const title = evaluation
            ? `${site.name}: global score ${evaluation.scores.global}/100 (overall verdict: ${LEVEL_LABEL[evaluation.overall]})`
            : `${site.name}: loading`
          return (
            <g
              key={site.id}
              className={`polar__site polar__site--${level}${labels.length ? ' polar__site--selected' : ''}`}
              transform={`translate(${px(x)} ${px(y)})`}
              role="button"
              tabIndex={0}
              aria-label={title}
              onClick={() => onSelect(site.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(site.id)
                }
              }}
            >
              <title>{title}</title>
              {labels.length > 0 && <circle className="polar__ring" r="15" />}
              <Shape group={site.group} r={8} />
              <text className="polar__label" x={offset.dx} y={offset.dy} textAnchor={offset.anchor}>
                {site.shortName}
                {labels.length > 0 && ` (${labels.join(', ')})`}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="polar__legend">
        <span>Global score:</span>
        <span>
          <span className="dot dot--ok" /> 60 or more
        </span>
        <span>
          <span className="dot dot--warn" /> 50 to 59
        </span>
        <span>
          <span className="dot dot--fail" /> below 50
        </span>
        <span>
          <span className="dot dot--unknown" /> loading</span>
        <span>● Artemis III region · ◆ mission site · ▲ reference point</span>
      </figcaption>
    </figure>
  )
}
