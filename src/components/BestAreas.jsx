import { useState } from 'react'
import { nearestSite } from '../lib/bestAreas.js'
import { formatPercent } from '../lib/format.js'
import { scoreLevel } from '../lib/scores.js'

const place = (a) => `${Math.abs(a.lat).toFixed(2)}° S, ${a.lon.toFixed(1)}° E`

// "Where should we land?": the best areas of the period, best first. Click one to fly the camera to it.
// areas: null before the first search, then the list; sites: to name an area after a nearby known site.
export default function BestAreas({ areas, searching, ready, onSearch, onFly, sites }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="bestareas" aria-label="Best landing areas">
      <button
        type="button"
        className="bestareas__toggle"
        aria-expanded={open}
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
            <p className="bestareas__note">No area is ever optimal in this period with these requirements: relax the slope limit or change the dates.</p>
          )}
          {areas && areas.length > 0 && (
            <ol className="bestareas__list">
              {areas.map((a, i) => {
                const near = nearestSite(a, sites)
                return (
                  <li key={a.cell}>
                    <button type="button" className="bestareas__item" onClick={() => onFly(a)} title="Fly to this area">
                      <span className="bestareas__rank">{i + 1}</span>
                      <span className="bestareas__what">
                        <strong>{near ? `Near ${near.site.shortName}` : place(a)}</strong>
                        <span>
                          Optimal {formatPercent(a.goFraction)} of the period · slope {a.slopeDeg}°
                          {near ? ` · ${place(a)}` : ''}
                        </span>
                      </span>
                      <span className={`bestareas__score bestareas__score--${scoreLevel(a.score)}`}>{a.score}</span>
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
            <span className="bestareas__note">South of 83°S, 2.4 km cells, over the period of scenario A with the rover requirements.</span>
          </div>
        </div>
      )}
    </section>
  )
}
