import { useEffect, useRef, useState } from 'react'
import { nearestSite } from '../lib/bestAreas.js'
import { formatPercent, formatUtc } from '../lib/format.js'
import { LEVEL_LABEL } from '../lib/verdict.js'

const place = (a) => `${Math.abs(a.lat).toFixed(2)}° S, ${a.lon.toFixed(1)}° E`

// "Where should we land?": a menu of the top bar, so it works in every tab. The best areas of the period, feasible first. Click one
// to select that place and jump the timeline to its best landing moment (the score shown is the score of that moment).
// areas: null before the first search, then the list; sites: to name an area after a nearby known site.
export default function BestAreas({ areas, searching, ready, onSearch, onPick, sites }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <section className="bestareas" aria-label="Best landing areas" ref={ref}>
      <button
        type="button"
        className="chip bestareas__toggle"
        aria-expanded={open}
        title="Where should we land? The best areas of the range of dates of the timeline"
        onClick={() => {
          setOpen((o) => !o)
          if (!open && areas === null && !searching) onSearch()
        }}
        disabled={!ready}
      >
        <span className="swatch swatch--go" /> Best landing areas {areas ? `(${areas.length})` : ''}
      </button>
      {open && (
        <div className="bestareas__body">
          {searching && <p className="bestareas__note">Searching the whole region…</p>}
          {areas && areas.length === 0 && !searching && (
            <p className="bestareas__note">No area is ever optimal in this range of dates with these requirements: relax the slope limit or change the range.</p>
          )}
          {areas && areas.length > 0 && (
            <ol className="bestareas__list">
              {areas.map((a, i) => {
                const near = nearestSite(a, sites)
                return (
                  <li key={a.cell}>
                    <button type="button" className="bestareas__item" onClick={() => onPick(a)} title="Select this place and jump to its best landing moment">
                      <span className="bestareas__rank">{i + 1}</span>
                      <span className="bestareas__what">
                        <strong>{near ? `Near ${near.site.shortName}` : place(a)}</strong>
                        <span>
                          Land {formatUtc(a.landingMs)} · optimal {formatPercent(a.goFraction)} of the range · slope {a.slopeDeg}°
                          {near ? ` · ${place(a)}` : ''}
                        </span>
                        {a.level !== 'ok' && <span className="bestareas__reason">{a.reason}</span>}
                      </span>
                      <span className="bestareas__verdict">
                        <span className={`bestareas__score bestareas__score--${a.level}`}>{a.score}</span>
                        <span className={`pill pill--${a.level}`}>{LEVEL_LABEL[a.level]}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          <div className="bestareas__foot">
            <button type="button" className="link-button" onClick={onSearch} disabled={searching}>
              Search again
            </button>
            <span className="bestareas__note">
              South of 83°S, 2.4 km cells, over the range of dates of the timeline (Range, next to Step) with the mission requirements. Each area is judged at its own best
              landing moment, like a place you click.
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
