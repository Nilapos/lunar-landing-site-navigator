// Terrain horizon from the LOLA south polar elevation map (LDEM_80S_80M, NASA PDS).
//
// Map format (from the PDS label): 7600 x 7600 little-endian int16, polar stereographic centered on
// the south pole, 80 m per pixel, covering 80S to 90S. Height (m) = value * 0.5, measured from a
// reference sphere of radius 1737.4 km. Orientation validated against known terrain
// (Malapert massif high; Shackleton, Shoemaker, Faustini, Haworth deep):
//   column = center + rho * sin(lon) / scale,  row = center - rho * cos(lon) / scale
// with rho = 2 * R * tan(colatitude / 2) and lon the east longitude.

export const MOON_RADIUS_M = 1737400
const RAD = Math.PI / 180

/** Wrap raw int16 data as a DEM. Defaults match LDEM_80S_80M. */
export function createDem(data, { size = 7600, scaleM = 80, heightFactor = 0.5 } = {}) {
  if (data.length !== size * size) throw new RangeError(`Expected ${size * size} samples, got ${data.length}`)
  return { data, size, scaleM, heightFactor, center: (size - 1) / 2 }
}

/** Pixel position [column, row] (fractional) of a lat/lon on the map. */
export function toPixel(dem, latDeg, lonDeg) {
  const colat = (latDeg + 90) * RAD
  const rho = 2 * MOON_RADIUS_M * Math.tan(colat / 2)
  const lon = lonDeg * RAD
  return [dem.center + (rho * Math.sin(lon)) / dem.scaleM, dem.center - (rho * Math.cos(lon)) / dem.scaleM]
}

/** Height in meters at fractional pixel (bilinear); NaN outside the map. */
function heightAtPixel(dem, col, row) {
  const { size, data, heightFactor } = dem
  if (!(col >= 0 && row >= 0 && col < size - 1 && row < size - 1)) return NaN
  const c0 = Math.floor(col)
  const r0 = Math.floor(row)
  const fc = col - c0
  const fr = row - r0
  const i = r0 * size + c0
  const top = data[i] * (1 - fc) + data[i + 1] * fc
  const bottom = data[i + size] * (1 - fc) + data[i + size + 1] * fc
  return (top * (1 - fr) + bottom * fr) * heightFactor
}

/** Terrain height (m above the 1737.4 km reference sphere) at a lat/lon; NaN outside the map. */
export function heightAt(dem, latDeg, lonDeg) {
  const [col, row] = toPixel(dem, latDeg, lonDeg)
  return heightAtPixel(dem, col, row)
}

/**
 * Horizon profile seen from a site: 360 elevation angles (deg), index = azimuth in whole degrees
 * (0 = north, 90 = east). For each azimuth we walk outward along the great circle and keep the
 * highest angle at which terrain rises above the local horizontal plane of the observer.
 * Exact on a sphere: no flat-Moon approximation. Not valid at the exact pole (north is undefined).
 */
export function computeHorizonProfile(dem, latDeg, lonDeg, { observerHeightM = 0, maxDistanceM = 200000, stepM } = {}) {
  const step = stepM ?? dem.scaleM
  const observerRadius = MOON_RADIUS_M + heightAt(dem, latDeg, lonDeg) + observerHeightM
  if (Number.isNaN(observerRadius)) throw new RangeError('Site is outside the elevation map')
  const lat1 = latDeg * RAD
  const lon1 = lonDeg * RAD
  const sinLat1 = Math.sin(lat1)
  const cosLat1 = Math.cos(lat1)
  const profile = new Array(360)

  for (let az = 0; az < 360; az++) {
    const bearing = az * RAD
    const cosB = Math.cos(bearing)
    const sinB = Math.sin(bearing)
    let best = -90
    for (let d = step; d <= maxDistanceM; d += step) {
      const delta = d / MOON_RADIUS_M
      const sinD = Math.sin(delta)
      const cosD = Math.cos(delta)
      const sinLat2 = sinLat1 * cosD + cosLat1 * sinD * cosB
      const lat2 = Math.asin(sinLat2)
      const lon2 = lon1 + Math.atan2(sinB * sinD * cosLat1, cosD - sinLat1 * sinLat2)
      const rho = 2 * MOON_RADIUS_M * Math.tan((lat2 + Math.PI / 2) / 2)
      const h = heightAtPixel(
        dem,
        dem.center + (rho * Math.sin(lon2)) / dem.scaleM,
        dem.center - (rho * Math.cos(lon2)) / dem.scaleM,
      )
      if (Number.isNaN(h)) break // left the map
      const targetRadius = MOON_RADIUS_M + h
      const elevation = Math.atan2(targetRadius * cosD - observerRadius, targetRadius * sinD) / RAD
      if (elevation > best) best = elevation
    }
    profile[az] = Math.round(best * 100) / 100
  }
  return profile
}
