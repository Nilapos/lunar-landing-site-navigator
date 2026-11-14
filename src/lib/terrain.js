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

/**
 * Wrap raw int16 data of any LDEM_80S product (80 m: 7600 px, 40 m: 15200, 20 m: 30400; same projection, same covered
 * area) as a DEM, taking the size from the data and the pixel scale from the size.
 */
export function createDemAuto(data, { heightFactor = 0.5 } = {}) {
  const size = Math.round(Math.sqrt(data.length))
  return createDem(data, { size, scaleM: (80 * 7600) / size, heightFactor })
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

/** Slope (deg) at an integer pixel from its 8 neighbors (Horn's method); NaN on the map border. */
export function slopeAtPixel(dem, col, row) {
  const { data, size, scaleM, heightFactor } = dem
  if (col < 1 || row < 1 || col >= size - 1 || row >= size - 1) return NaN
  const i = row * size + col
  const a = data[i - size - 1]
  const b = data[i - size]
  const c = data[i - size + 1]
  const d = data[i - 1]
  const f = data[i + 1]
  const g = data[i + size - 1]
  const h = data[i + size]
  const k = data[i + size + 1]
  const dzdx = ((c + 2 * f + k - (a + 2 * d + g)) * heightFactor) / (8 * scaleM)
  const dzdy = ((g + 2 * h + k - (a + 2 * b + c)) * heightFactor) / (8 * scaleM)
  return Math.atan(Math.hypot(dzdx, dzdy)) / RAD
}

export const SLOPE_BINS = 46 // 1-degree bins from 0; the last one holds 45 degrees and more

/**
 * Terrain around a site: height, mean and maximum slope within `radiusM` (a lander's landing ellipse,
 * 100 m), and a slope histogram within `histogramRadiusM` (to tell how much of the surroundings is steeper
 * than a rover's limit). Slopes are computed at the map resolution (80 m), so they smooth out steeper
 * local features.
 */
export function slopeStats(dem, latDeg, lonDeg, { radiusM = 100, histogramRadiusM = 500 } = {}) {
  const [col, row] = toPixel(dem, latDeg, lonDeg)
  const reachM = Math.max(radiusM, histogramRadiusM)
  const reach = Math.ceil(reachM / dem.scaleM) + 1
  const histogram = new Array(SLOPE_BINS).fill(0)
  let sum = 0
  let count = 0
  let max = 0
  for (let r = Math.round(row) - reach; r <= Math.round(row) + reach; r++) {
    for (let c = Math.round(col) - reach; c <= Math.round(col) + reach; c++) {
      const dist = Math.hypot(c - col, r - row) * dem.scaleM
      if (dist > reachM) continue
      const slope = slopeAtPixel(dem, c, r)
      if (Number.isNaN(slope)) continue
      if (dist <= radiusM) {
        sum += slope
        count++
        if (slope > max) max = slope
      }
      if (dist <= histogramRadiusM) histogram[Math.min(Math.floor(slope), SLOPE_BINS - 1)]++
    }
  }
  if (count === 0) throw new RangeError('Site is too close to the edge of the elevation map')
  return {
    elevationM: Math.round(heightAt(dem, latDeg, lonDeg)),
    slopeMeanDeg: Math.round((sum / count) * 100) / 100,
    slopeMaxDeg: Math.round(max * 100) / 100,
    histogram500: histogram,
  }
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
