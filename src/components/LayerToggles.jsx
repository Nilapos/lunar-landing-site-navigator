// The ground layers as compact pills: a colored dot (the color on the ground) and a short word.
// "Optimal" crosses the other three (slope under the limit, Sun up, Earth up) and replaces them while it is on.
const LAYERS = [
  { key: 'sun', label: 'Sunlight', swatch: 'sun', title: 'Sunlight and shadows' },
  { key: 'earth', label: 'Earth', swatch: 'earth', title: 'Earth visible (direct link)' },
  { key: 'slope', label: 'Slope', swatch: 'slope', title: 'Forbidden zones' },
]
const BASE = { sun: true, earth: true, slope: true }

export default function LayerToggles({ layers, onChange, maxSlopeDeg }) {
  const toggleBase = (key) => onChange({ ...layers, go: false, [key]: layers.go ? true : !layers[key] })
  const toggleGo = () => onChange(layers.go ? { ...layers, ...BASE, go: false } : { ...layers, sun: false, earth: false, slope: false, go: true })
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
        title={`Optimal: slope under ${maxSlopeDeg}°, Sun and Earth both above the local horizon`}
        onClick={toggleGo}
      >
        <span className="swatch swatch--go" />
        Optimal
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
