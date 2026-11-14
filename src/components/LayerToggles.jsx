// The ground layers of the two 3D views, with the color legend of the mockup.
export default function LayerToggles({ layers, onChange, maxSlopeDeg }) {
  const toggle = (key) => (e) => onChange({ ...layers, [key]: e.target.checked })
  return (
    <div className="layers">
      <label className="toggle layers__item">
        <input type="checkbox" checked={layers.sun} onChange={toggle('sun')} />
        <span className="swatch swatch--sun" />
        <span>Sunlight and shadows</span>
      </label>
      <label className="toggle layers__item">
        <input type="checkbox" checked={layers.earth} onChange={toggle('earth')} />
        <span className="swatch swatch--earth" />
        <span>Earth visible (direct link)</span>
      </label>
      <label className="toggle layers__item">
        <input type="checkbox" checked={layers.slope} onChange={toggle('slope')} />
        <span className="swatch swatch--slope" />
        <span>Forbidden zones (slope above {maxSlopeDeg}°)</span>
      </label>
      <span className="layers__item layers__item--static">
        <span className="swatch swatch--shadow" /> in shadow
      </span>
    </div>
  )
}
