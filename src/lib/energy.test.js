import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  energyBalance,
  integrateWhPerM2,
  irradianceNormal,
  neededWhPerDay,
  panelCosine,
  simulateBattery,
  solarSeries,
  sunDiscFraction,
  sunRadiusDeg,
} from './energy.js'

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`)
const H = 3600000
const t0 = Date.UTC(2026, 10, 14)

// A series with a constant Sun, one point per hour.
const flatSeries = (hours, { sunEl = 10, sunAz = 0, deltaAu = 1, angDiamArcsec = 1920 } = {}) =>
  Array.from({ length: hours + 1 }, (_, h) => ({
    t: new Date(t0 + h * H).toISOString(),
    sunAz,
    sunEl,
    earthAz: 0,
    earthEl: 0,
    sunDeltaAu: deltaAu,
    sunAngDiamArcsec: angDiamArcsec,
  }))

const PANEL = { mode: 'vertical-tracking' }
const SPECS = {
  panelAreaM2: 2,
  panelEfficiency: 0.3,
  chargeEfficiency: 0.9,
  batteryWh: 1000,
  consumption: { operatingW: 100, survivalW: 20, operatingHoursPerDay: 6 },
  panel: PANEL,
}

test('irradiance: 1361 W/m2 at 1 au, and the inverse square law (Horizons gave delta 0.98808 au on 15 Nov 2026)', () => {
  assert.equal(irradianceNormal(1), 1361)
  close(irradianceNormal(0.98807714), 1394.0, 0.5)
  close(irradianceNormal(2), 1361 / 4, 1e-9)
})

test('the Sun radius comes from the apparent diameter (1941.6 arcsec is 0.2697 deg)', () => {
  close(sunRadiusDeg(1941.612), 0.26967, 1e-4)
})

test('share of the Sun disc above a straight horizon', () => {
  const r = 0.27
  assert.equal(sunDiscFraction(r, r), 1)
  assert.equal(sunDiscFraction(5, r), 1)
  assert.equal(sunDiscFraction(-r, r), 0)
  assert.equal(sunDiscFraction(-3, r), 0)
  close(sunDiscFraction(0, r), 0.5, 1e-12) // centre on the horizon: half the disc
  close(sunDiscFraction(r / 2, r), 0.8045, 1e-3) // checked by hand: 0.5 + (0.5 * 0.866 + 0.5236) / pi
  // Symmetric around the horizon: what is lost below is what is gained above.
  close(sunDiscFraction(0.1, r) + sunDiscFraction(-0.1, r), 1, 1e-12)
})

test('incidence on the panel: flat, vertical facing the Sun, and fixed', () => {
  close(panelCosine({ mode: 'horizontal' }, 30, 123), 0.5, 1e-12)
  close(panelCosine({ mode: 'vertical-tracking' }, 60, 123), 0.5, 1e-12)
  close(panelCosine({ mode: 'vertical-tracking' }, 2, 0), Math.cos((2 * Math.PI) / 180), 1e-12) // the factor 29 over a flat panel
  close(panelCosine({ mode: 'horizontal' }, 2, 0), Math.sin((2 * Math.PI) / 180), 1e-12)
  const east = { mode: 'fixed', tiltDeg: 90, azimuthDeg: 90 }
  close(panelCosine(east, 20, 90), Math.cos((20 * Math.PI) / 180), 1e-12) // facing the Sun
  assert.equal(panelCosine(east, 20, 270), 0) // Sun behind the panel
  close(panelCosine({ mode: 'fixed', tiltDeg: 0, azimuthDeg: 0 }, 30, 77), 0.5, 1e-12) // tilt 0 = flat
})

test('no Sun distance in the series: no energy is claimed', () => {
  const series = flatSeries(3).map(({ sunDeltaAu: _distance, sunAngDiamArcsec: _diameter, ...rest }) => rest)
  assert.equal(solarSeries(series, null, PANEL), null)
  assert.equal(energyBalance({ series, profile: null, minSunDeg: 0 }, SPECS), null)
  assert.equal(energyBalance({ series: flatSeries(3), profile: null, minSunDeg: 0 }, null), null)
})

test('integration: a constant 100 W/m2 for 24 h is 2400 Wh/m2', () => {
  const points = [0, 12, 24].map((h) => ({ t: t0 + h * H, wPerM2: 100 }))
  assert.equal(integrateWhPerM2(points), 2400)
})

test('energy balance with a Sun well above the horizon: every number by hand', () => {
  const inputs = { series: flatSeries(48), profile: null, minSunDeg: 0 }
  const b = energyBalance(inputs, SPECS)
  const wPerM2 = 1361 * Math.cos((10 * Math.PI) / 180) // f = 1: the whole disc is above the horizon
  close(b.days, 2, 1e-12)
  close(b.incidentWhPerM2, wPerM2 * 48, 1e-6)
  close(b.incidentWh, wPerM2 * 48 * 2, 1e-6)
  close(b.storedWh, wPerM2 * 48 * 2 * 0.3 * 0.9, 1e-6)
  close(b.storedWhPerDay, wPerM2 * 24 * 2 * 0.3 * 0.9, 1e-6)
  assert.equal(b.neededWhPerDay, 100 * 6 + 20 * 18) // 960 Wh per day
  close(b.ratio, b.storedWhPerDay / 960, 1e-9)
  assert.equal(b.battery.blackoutFraction, 0)
  assert.equal(b.battery.minWh, 1000)
})

test('a terrain horizon above the Sun leaves nothing: no energy, and the battery runs flat', () => {
  const profile = new Array(360).fill(5) // 5 degrees all around, the Sun is at 1
  const b = energyBalance({ series: flatSeries(48, { sunEl: 1 }), profile, minSunDeg: 0 }, SPECS)
  assert.equal(b.storedWh, 0)
  assert.equal(b.ratio, 0)
  assert.equal(b.battery.minWh, 0)
  close(b.battery.blackoutFraction, 0.5, 1e-12) // 1000 Wh at 40 W: empty after 25 h, so the last 24 h of 48 are without power
})

test('minSunDeg raises the bar: a Sun that clears the horizon by less than it gives nothing', () => {
  const inputs = (minSunDeg) => ({ series: flatSeries(24, { sunEl: 1 }), profile: null, minSunDeg })
  assert.ok(energyBalance(inputs(0), SPECS).storedWh > 0)
  assert.equal(energyBalance(inputs(2), SPECS).storedWh, 0)
})

test('battery simulation: empty after 10 h of an unmet 10 W load, never empty when the panels give more than the load', () => {
  const times = Array.from({ length: 25 }, (_, h) => t0 + h * H)
  const dark = simulateBattery(new Array(25).fill(0), times, 100, 10)
  assert.equal(dark.minWh, 0)
  close(dark.blackoutFraction, 15 / 24, 1e-12)
  const sunny = simulateBattery(new Array(25).fill(50), times, 100, 10)
  assert.equal(sunny.minWh, 100) // it starts full and only gains
  assert.equal(sunny.blackoutFraction, 0)
})

test('needed energy per day: hours of work at the operating power, the rest at the survival power', () => {
  assert.equal(neededWhPerDay({ operatingW: 150, survivalW: 25, operatingHoursPerDay: 8 }), 150 * 8 + 25 * 16)
})
