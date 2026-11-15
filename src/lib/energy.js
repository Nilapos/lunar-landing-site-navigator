// Solar energy on a vehicle's panels and in its battery, for one site over a period T.
//
// The chain, each step with its source:
//   1. Irradiance normal to the Sun's rays   I = S / delta^2   (W/m2)
//        S = 1361 W/m2: nominal total solar irradiance at 1 au (IAU 2015 Resolution B3); delta: Sun-site distance in au, from JPL Horizons
//        (quantity 20, see horizons.js). It changes by about +-3% over a year (Earth's orbit).
//   2. Share of the Sun's disc above the terrain   f  (0..1)
//        The disc is not a point: its apparent diameter comes from JPL Horizons (quantity 13, about 0.53 deg). The terrain horizon of the
//        site (LOLA, see terrain.js) cuts it: f is the visible fraction of its area, for a locally straight horizon (circular segment).
//        I already is the power of the WHOLE disc, so f multiplies it: no solid angle in steradians is needed (it would count it twice).
//   3. Incidence on the panel   cos(theta)  (see panelCosine): the panel sees the Sun through its tilt.
//        E = I * f * cos(theta)   (W/m2 on the panel's surface)
//   4. Power on the panels  P = E * A   (A = panel area), then in the battery   P_battery = P * efficiency * chargeEfficiency.
//   5. Energy over the period T: trapezoids between the ephemeris samples (Wh), and a battery simulation (state of charge).
//
// Not modeled (said in the interface and in the summary): light reflected by sunlit terrain, shadow of the vehicle on its own panels,
// temperature and dust effects on the efficiency, the horizon's variation across the disc (it is taken as a straight line).
import { horizonAt } from './visibility.js'

export const SOLAR_CONSTANT_W_M2 = 1361 // IAU 2015 Resolution B3, nominal total solar irradiance at 1 au

const DEG = Math.PI / 180
const HOUR_MS = 3600000
const DAY_HOURS = 24

/** Irradiance (W/m2) of the Sun's rays, normal to them, at `deltaAu` astronomical units from the Sun. */
export function irradianceNormal(deltaAu) {
  return SOLAR_CONSTANT_W_M2 / deltaAu ** 2
}

/**
 * Fraction (0..1) of the Sun's disc above a straight horizon, from the height of its centre above it.
 *   marginDeg: elevation of the centre minus the horizon (negative: centre below); radiusDeg: angular radius of the disc.
 * Area of a circular segment: with x = margin / radius, f = 1/2 + (x * sqrt(1 - x^2) + asin(x)) / pi.
 */
export function sunDiscFraction(marginDeg, radiusDeg) {
  if (!(radiusDeg > 0)) return marginDeg > 0 ? 1 : 0
  const x = Math.min(Math.max(marginDeg / radiusDeg, -1), 1)
  return 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / Math.PI
}

/** Angular radius (deg) of the Sun's disc from its apparent diameter (arcsec, JPL Horizons quantity 13). */
export function sunRadiusDeg(angDiamArcsec) {
  return angDiamArcsec / 2 / 3600
}

export const PANEL_MODES = ['vertical-tracking', 'horizontal', 'fixed']

/**
 * cos(angle between the Sun's rays and the panel's normal), 0 when the Sun is behind the panel.
 *   panel.mode:
 *     'vertical-tracking': a vertical panel that keeps facing the Sun's azimuth (the vehicle turns, or the panel does): cos(elevation);
 *     'horizontal': a panel lying flat: sin(elevation);
 *     'fixed': a panel tilted `tiltDeg` from the horizontal (0 = flat, 90 = vertical) facing `azimuthDeg` (0 = north, clockwise).
 * Near the south pole the Sun stays within a few degrees of the horizon, so the mode changes the result by a large factor.
 */
export function panelCosine(panel, sunElDeg, sunAzDeg) {
  const el = sunElDeg * DEG
  switch (panel.mode) {
    case 'horizontal':
      return Math.max(0, Math.sin(el))
    case 'fixed': {
      const tilt = panel.tiltDeg * DEG
      const diff = (sunAzDeg - panel.azimuthDeg) * DEG
      // Sun and normal in (east, north, up); the dot product simplifies to:
      return Math.max(0, Math.sin(tilt) * Math.cos(el) * Math.cos(diff) + Math.cos(tilt) * Math.sin(el))
    }
    default:
      return Math.max(0, Math.cos(el))
  }
}

/**
 * Irradiance on the panels over time: [{ t (ms), wPerM2, irradiance, fraction, cosine }]. Null when the series has no Sun distance
 * (a series from before it was requested): no energy is then claimed.
 *   series: see horizons.js; profile: the site's horizon (360 values) or null; minSunDeg: the Sun must clear the horizon by this much.
 */
export function solarSeries(series, profile, panel, minSunDeg = 0) {
  if (series.length === 0 || series.some((p) => !(p.sunDeltaAu > 0) || !(p.sunAngDiamArcsec > 0))) return null
  return series.map((p) => {
    const irradiance = irradianceNormal(p.sunDeltaAu)
    const margin = p.sunEl - horizonAt(profile, p.sunAz) - minSunDeg
    const fraction = sunDiscFraction(margin, sunRadiusDeg(p.sunAngDiamArcsec))
    const cosine = panelCosine(panel, p.sunEl, p.sunAz)
    return { t: Date.parse(p.t), wPerM2: irradiance * fraction * cosine, irradiance, fraction, cosine }
  })
}

/** Integral of a W/m2 series over its whole length, trapezoids: Wh/m2. */
export function integrateWhPerM2(points) {
  let wh = 0
  for (let i = 1; i < points.length; i++) wh += (0.5 * (points[i - 1].wPerM2 + points[i].wPerM2) * (points[i].t - points[i - 1].t)) / HOUR_MS
  return wh
}

/**
 * Battery simulation: state of charge (Wh) over the series, starting full, for a constant load. Between two samples the panels give the
 * mean of their two powers. Returns { minWh, blackoutFraction } (share of the period with an empty battery that the load is not met).
 */
export function simulateBattery(powerW, times, batteryWh, loadW) {
  let soc = batteryWh
  let minWh = batteryWh
  let blackoutMs = 0
  for (let i = 1; i < times.length; i++) {
    const hours = (times[i] - times[i - 1]) / HOUR_MS
    const generated = 0.5 * (powerW[i - 1] + powerW[i])
    const next = soc + (generated - loadW) * hours
    if (next <= 0 && generated < loadW) blackoutMs += times[i] - times[i - 1]
    soc = Math.min(batteryWh, Math.max(0, next))
    if (soc < minWh) minWh = soc
  }
  const total = times[times.length - 1] - times[0]
  return { minWh, blackoutFraction: total > 0 ? blackoutMs / total : 0 }
}

/** Energy the vehicle needs per day of 24 h (Wh): operating hours at the operating power, the rest at the survival power. */
export function neededWhPerDay({ operatingW, survivalW, operatingHoursPerDay }) {
  return operatingW * operatingHoursPerDay + survivalW * (DAY_HOURS - operatingHoursPerDay)
}

/**
 * The energy balance of one vehicle at one site over the period T (the length of the series).
 *   inputs: { series, profile, minSunDeg };  specs: the vehicle's power.energy (see vehicles.js).
 * Returns null without specs or without the Sun's distance in the series, else
 *   { days, incidentWhPerM2, incidentWh, storedWh, storedWhPerDay, neededWhPerDay, ratio, battery }
 * where ratio = stored per day / needed per day (the project's rule: offered / needed) and battery = { minWh, blackoutFraction } or null
 * when the battery capacity is unknown.
 */
export function energyBalance(inputs, specs) {
  if (!specs || !inputs) return null
  const points = solarSeries(inputs.series, inputs.profile, specs.panel, inputs.minSunDeg)
  if (!points || points.length < 2) return null
  const days = (points[points.length - 1].t - points[0].t) / (DAY_HOURS * HOUR_MS)
  const incidentWhPerM2 = integrateWhPerM2(points)
  const incidentWh = incidentWhPerM2 * specs.panelAreaM2
  const conversion = specs.panelEfficiency * specs.chargeEfficiency
  const storedWh = incidentWh * conversion
  const needed = neededWhPerDay(specs.consumption)
  const battery =
    specs.batteryWh > 0
      ? simulateBattery(
          points.map((p) => p.wPerM2 * specs.panelAreaM2 * conversion),
          points.map((p) => p.t),
          specs.batteryWh,
          needed / DAY_HOURS,
        )
      : null
  return {
    days,
    incidentWhPerM2,
    incidentWh,
    storedWh,
    storedWhPerDay: storedWh / days,
    neededWhPerDay: needed,
    ratio: needed > 0 ? storedWh / days / needed : Infinity,
    battery,
  }
}
