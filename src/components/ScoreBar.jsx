import { scoreLevel } from '../lib/scores.js'

// Order and names follow the mockup: Solar Exposure, Telecom, Global Score (center), Window Duration, Topography.
const TILES = [
  { key: 'solar', label: 'Solar Exposure', item: 'power' },
  { key: 'telecom', label: 'Telecom', item: 'comms' },
  { key: 'global', label: 'Global Score', item: null },
  { key: 'window', label: 'Window Duration', item: 'window' },
  { key: 'topography', label: 'Topography', item: 'terrain' },
]

export default function ScoreBar({ evaluation }) {
  return (
    <section className="scores" aria-label="Scores out of 100">
      {TILES.map((t) => {
        const score = evaluation.scores[t.key]
        const detail = t.item ? evaluation.items.find((i) => i.key === t.item).detail : 'Average of the four scores.'
        return (
          <div
            key={t.key}
            className={`scores__tile scores__tile--${scoreLevel(score)}${t.key === 'global' ? ' scores__tile--global' : ''}`}
            title={detail}
          >
            <span className="scores__label">{t.label}</span>
            <span className="scores__value">
              {score}
              <span className="scores__max">/100</span>
            </span>
          </div>
        )
      })}
    </section>
  )
}
