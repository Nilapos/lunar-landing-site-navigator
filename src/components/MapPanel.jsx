// Placeholder map. Teo: replace with the real map/globe once the design is chosen.
// Sites are placed with a simple equirectangular projection (lon -180..180, lat -90..90).
export default function MapPanel({ sites, selectedId, onSelect }) {
  return (
    <section className="map" aria-label="Lunar map">
      <div className="map__surface">
        {sites.map((site) => (
          <button
            key={site.id}
            type="button"
            className={`map__marker${site.id === selectedId ? ' map__marker--selected' : ''}`}
            style={{
              left: `${((site.lon + 180) / 360) * 100}%`,
              top: `${((90 - site.lat) / 180) * 100}%`,
            }}
            onClick={() => onSelect(site.id)}
            aria-label={site.name}
            title={site.name}
          />
        ))}
      </div>
    </section>
  )
}
