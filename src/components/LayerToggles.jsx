// The ground layers as compact pills: a colored dot (the color on the ground) and a short word.
// Two "modes" cross the three base layers and replace them while they are on:
//   Optimal  = slope, Sun and Earth fine at once (at the moment shown, or the share of the period);
//   Feasible = the cell meets the power, link and terrain requirements over the whole period.
const LAYERS = [
  { key: 'sun', label: 'Sunlight', swatch: 'sun', title: 'Sunlight and shadows' },
  { key: 'earth', label: 'Earth', swatch: 'earth', title: 'Earth visible (direct link)' },
  { key: 'slope', label: 'Slope', swatch: 'slope', title: 'Forbidden zones' },
]
const BASE = { sun: true, earth: true, slope: true }
const NO_MODE = { go: false, feasible: false }

export default function LayerToggles({ layers, onChange, maxSlopeDeg }) {
  const inMode = !!(layers.go || layers.feasible)
  const toggleBase = (key) => onChange({ ...layers, ...NO_MODE, [key]: inMode ? true : !layers[key] })
  const toggleMode = (mode) =>
    onChange(layers[mode] ? { ...layers, ...BASE, ...NO_MODE } : { ...layers, sun: false, earth: false, slope: false, ...NO_MODE, [mode]: true })
  return (
    <div className="layers" role="group" aria-label="Ground layers">
      {LAYERS.map((l) => (
        <button
          key={l.key}
          type="button"
          className={`layers__pill${layers[l.key] ? ' layers__pill--on' : ''}`}
          aria-pressed={layers[l.key]}
          title={l.key === 'slope' ? `${l.title} (slope above ${maxSlopeDeg}°)` : l.title}
          onClick={() => toggleBase(l.key)}
        >
          <span className={`swatch swatch--${l.swatch}`} />
          {l.label}
        </button>
      ))}
      <button
        type="button"
        className={`layers__pill layers__pill--go${layers.go ? ' layers__pill--on' : ''}`}
        aria-pressed={!!layers.go}
        title={`Optimal: slope under ${maxSlopeDeg}°, Sun and Earth both above the local horizon (at the moment shown, or the share of the period)`}
        onClick={() => toggleMode('go')}
      >
        <span className="swatch swatch--go" />
        Optimal
      </button>
      <button
        type="button"
        className={`layers__pill layers__pill--go${layers.feasible ? ' layers__pill--on' : ''}`}
        aria-pressed={!!layers.feasible}
        title="Feasible: the cell meets the power, link and terrain requirements over the whole period. Green: met with margin; amber: marginal. The landing window depends on the day, not on the place, so it is not part of it."
        onClick={() => toggleMode('feasible')}
      >
        <span className="swatch swatch--go" />
        Feasible
      </button>
      {layers.go && (
        <div className="tabs layers__mode" role="group" aria-label="Optimal layer mode">
          <button type="button" className={`tabs__tab${layers.goPeriod ? '' : ' tabs__tab--active'}`} aria-pressed={!layers.goPeriod} onClick={() => onChange({ ...layers, goPeriod: false })}>
            Now
          </button>
          <button
            type="button"
            className={`tabs__tab${layers.goPeriod ? ' tabs__tab--active' : ''}`}
            aria-pressed={!!layers.goPeriod}
            title="Share of the period during which the cell is good"
            onClick={() => onChange({ ...layers, goPeriod: true })}
          >
            Period
          </button>
        </div>
      )}
    </div>
  )
}
