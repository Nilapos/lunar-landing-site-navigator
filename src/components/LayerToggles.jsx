// The three ground layers as compact pills: a colored dot (the color on the ground) and a short word.
const LAYERS = [
  { key: 'sun', label: 'Sunlight', swatch: 'sun', title: 'Sunlight and shadows' },
  { key: 'earth', label: 'Earth', swatch: 'earth', title: 'Earth visible (direct link)' },
  { key: 'slope', label: 'Slope', swatch: 'slope', title: 'Forbidden zones' },
]

export default function LayerToggles({ layers, onChange, maxSlopeDeg }) {
  return (
    <div className="layers" role="group" aria-label="Ground layers">
      {LAYERS.map((l) => (
        <button
          key={l.key}
          type="button"
          className={`layers__pill${layers[l.key] ? ' layers__pill--on' : ''}`}
          aria-pressed={layers[l.key]}
          title={l.key === 'slope' ? `${l.title} (slope above ${maxSlopeDeg}°)` : l.title}
          onClick={() => onChange({ ...layers, [l.key]: !layers[l.key] })}
        >
          <span className={`swatch swatch--${l.swatch}`} />
          {l.label}
        </button>
      ))}
    </div>
  )
}
