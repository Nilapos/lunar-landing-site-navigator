// The ground layers as compact pills: a colored dot (the color on the ground) and a short word.
// Two "modes" cross the three base layers and replace them while they are on:
//   Optimal  = slope, Sun and Earth fine at once (at the moment shown, or the share of the period);
//   Feasible = if you land at the moment of the timeline, the cell meets the power, link, window and terrain requirements to the end of the range.
const LAYERS = [
  { key: 'sun', label: 'Sunlight', swatch: 'sun', title: 'Sunlight and shadows' },
  { key: 'earth', label: 'Earth', swatch: 'earth', title: 'Earth visible (direct link)' },
  { key: 'slope', label: 'Slope', swatch: 'slope', title: 'Forbidden zones' },
]
// Layers from NASA Moon Trek tiles, shown on the photo whatever the mode (they are data of the place, not of the moment).
const DATA_LAYERS = [
  { key: 'psr', label: 'PSR', swatch: 'psr', title: 'Permanently shadowed regions (LROC NAC mosaic of the south pole, via NASA Moon Trek): the footprint of the regions that never see the Sun, with the images of their floors' },
  { key: 'rough', label: 'Roughness', swatch: 'rough', title: 'Surface roughness: RMS height deviation (m) of the LOLA 20 m map from the mean of the 100 m around each pixel, over 500 m cells (our own metric): a faint purple-to-pink veil from 0.95 m up to 1.85 m and more, nothing on smoother ground' },
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
        title="Feasible: if you land at the moment of the timeline, does the cell meet the power, link, landing window and terrain requirements until the end of the range? Green: met with margin; amber: marginal. Move the timeline to see where you could land when."
        onClick={() => toggleMode('feasible')}
      >
        <span className="swatch swatch--go" />
        Feasible
      </button>
      {DATA_LAYERS.map((l) => (
        <button
          key={l.key}
          type="button"
          className={`layers__pill${layers[l.key] ? ' layers__pill--on' : ''}`}
          aria-pressed={!!layers[l.key]}
          title={l.title}
          onClick={() => onChange({ ...layers, [l.key]: !layers[l.key] })}
        >
          <span className={`swatch swatch--${l.swatch}`} />
          {l.label}
        </button>
      ))}
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
