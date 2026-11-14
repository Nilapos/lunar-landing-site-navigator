import { scoreLevel } from '../lib/scores.js'

// Order and names follow the mockup: Solar Exposure, Telecom, Global Score (center), Window Duration, Topography.
const TILES = [
  { key: 'solar', label: 'Solar Exposure', item: 'power' },
  { key: 'telecom', label: 'Telecom', item: 'comms' },
  { key: 'global', label: 'Global Score', item: null },
  { key: 'window', label: 'Window Duration', item: 'window' },
  { key: 'topography', label: 'Topography', item: 'terrain' },
]

// `evaluation` can be null while the data loads: the tiles then show a dash.
export default function ScoreBar({ evaluation }) {
  return (
    <section className="scores" aria-label="Scores out of 100">
      {TILES.map((t) => {
        const score = evaluation ? evaluation.scores[t.key] : null
        const detail = !evaluation ? '' : t.item ? evaluation.items.find((i) => i.key === t.item).detail : 'Average of the four scores.'
        const level = score === null ? 'unknown' : scoreLevel(score)
        return (
          <div
            key={t.key}
            className={`scores__tile scores__tile--${level}${t.key === 'global' ? ' scores__tile--global' : ''}`}
            title={detail}
          >
            <span className="scores__label">{t.label}</span>
            <span className="scores__value">
              {score === null ? '–' : score}
              <span className="scores__max">/100</span>
            </span>
          </div>
        )
      })}
    </section>
  )
}
