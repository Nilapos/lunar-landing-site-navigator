// Catalog of landers and rovers, and the missions (a lander, with a rover or not) that set the mission requirements.
//
// WHY A PAIR. The two vehicles do not constrain a site in the same way, and a rover cannot go without a lander:
//   lander  -> landing (slope the legs and tilt allow, length of the descent sequence), survival while it stays put (power,
//              nights), the link to Earth (antenna, data rate);
//   rover   -> what it can drive (slope), and its own power autonomy and Sun elevation. It talks to Earth through the lander.
// So a MISSION = a lander + optionally a rover, and a rover lists the landers that can carry it (`carriedBy`: mass, volume,
// deployment). src/lib/missionRequirements.js turns a mission into the numbers the analysis uses (requirementsFor).
//
// RULE OF THE PROJECT: every value must come from a source. An entry whose numbers are not sourced yet MUST say
// `status: 'hypothesis'` (the interface flags it); a sourced entry says `status: 'sourced'` and lists its `sources`
// (https links). The "generic" entries below are hypotheses that reproduce the default requirements of the app, so that
// nothing changes until the real catalog is filled in.
//
// SCHEMA (all numbers in the units named in the key):
//   lander = {
//     id, name, agency, status: 'sourced' | 'hypothesis', note, sources: [{ label, url }],
//     massKg, payloadCapacityKg,                    // mass at landing, and what it can carry (a rover included)
//     landing: { maxSlopeDeg, ellipseM, sequenceMinutes },   // steepest slope it lands on, landing ellipse, Sun AND Earth needed this long
//     power: { survivalHours, minSunDeg, energy },  // longest darkness it survives; Sun at least this high over the horizon to charge;
//                                                   // energy: null (no energy balance), or the power specs below
//     comms: { antenna, dataRateNeededKbps, linkMinPerHour, minEarthDeg },  // antenna class (see ANTENNAS in scores.js), data it must send,
//                                                   // Earth link needed per hour, Earth at least this high (antenna pointing)
//   }
//   rover = {
//     id, name, agency, status, note, sources,
//     massKg, carriedBy: [lander ids],
//     mobility: { maxDriveSlopeDeg },               // steepest slope it can drive
//     power: { survivalHours, minSunDeg },          // same meaning as for the lander
//   }
//   power.energy = {                                // the energy balance, see src/lib/energy.js (each vehicle has its own)
//     panelAreaM2,                                  // area of the solar panels (m2)
//     panelEfficiency,                              // 0..1, sunlight -> electricity (cells, with the losses you want counted: dust, temperature)
//     chargeEfficiency,                             // 0..1, electricity -> battery (regulation and charging)
//     batteryWh,                                    // capacity of the battery (Wh), or null when unknown (no battery simulation)
//     consumption: { operatingW, survivalW, operatingHoursPerDay },   // power when working / when surviving, hours of work per 24 h
//     panel: { mode, tiltDeg, azimuthDeg },         // mode: 'vertical-tracking' (vertical, facing the Sun), 'horizontal', or 'fixed' (tiltDeg
//                                                   // from the horizontal, azimuthDeg from north); tilt and azimuth only for 'fixed'
//   }
//   Every number of an energy spec follows the same rule as the others: sourced, or the entry says `hypothesis`.
//   mission = { id, name, landerId, roverId | null, note }
import { ANTENNAS } from '../lib/scores.js'

export const STATUSES = ['sourced', 'hypothesis']

export const landers = [
  {
    id: 'generic-lander',
    name: 'Generic lander (hypothesis)',
    agency: 'none',
    status: 'hypothesis',
    note: 'Placeholder that reproduces the default requirements of the app. Replace with a catalog entry.',
    sources: [],
    massKg: null,
    payloadCapacityKg: 0,
    landing: { maxSlopeDeg: 15, ellipseM: null, sequenceMinutes: 10 },
    power: {
      survivalHours: 240,
      minSunDeg: 0,
      // HYPOTHESIS (illustrative numbers): a lander smaller than the heavy one, to show the energy balance. To be replaced by sourced values.
      energy: {
        panelAreaM2: 2,
        panelEfficiency: 0.28,
        chargeEfficiency: 0.9,
        batteryWh: 4000,
        consumption: { operatingW: 200, survivalW: 30, operatingHoursPerDay: 8 },
        panel: { mode: 'vertical-tracking' },
      },
    },
    comms: { antenna: 'mga', dataRateNeededKbps: 256, linkMinPerHour: 30, minEarthDeg: 0 },
  },
  {
    id: 'generic-heavy-lander',
    name: 'Generic heavy lander (hypothesis)',
    agency: 'none',
    status: 'hypothesis',
    note: 'Illustrative numbers only, to show how a lander that carries a rover changes the requirements. Replace with a catalog entry.',
    sources: [],
    massKg: null,
    payloadCapacityKg: 500,
    landing: { maxSlopeDeg: 10, ellipseM: null, sequenceMinutes: 15 },
    power: {
      survivalHours: 336,
      minSunDeg: 1,
      // HYPOTHESIS (illustrative numbers, like the rest of this entry): to show the energy balance, to be replaced by sourced values.
      energy: {
        panelAreaM2: 3,
        panelEfficiency: 0.28,
        chargeEfficiency: 0.9,
        batteryWh: 6000,
        consumption: { operatingW: 250, survivalW: 40, operatingHoursPerDay: 10 },
        panel: { mode: 'vertical-tracking' },
      },
    },
    comms: { antenna: 'hga', dataRateNeededKbps: 512, linkMinPerHour: 30, minEarthDeg: 2 },
  },
]

export const rovers = [
  {
    id: 'generic-small-rover',
    name: 'Generic small rover (hypothesis)',
    agency: 'none',
    status: 'hypothesis',
    note: 'Illustrative numbers only. Replace with a catalog entry.',
    sources: [],
    massKg: null,
    carriedBy: ['generic-heavy-lander'],
    mobility: { maxDriveSlopeDeg: 15 },
    power: {
      survivalHours: 120,
      minSunDeg: 2,
      // HYPOTHESIS (illustrative numbers): to be replaced by sourced values.
      energy: {
        panelAreaM2: 1.5,
        panelEfficiency: 0.28,
        chargeEfficiency: 0.9,
        batteryWh: 2000,
        consumption: { operatingW: 150, survivalW: 25, operatingHoursPerDay: 8 },
        panel: { mode: 'vertical-tracking' },
      },
    },
  },
]

export const missions = [
  {
    id: 'generic',
    name: 'Generic lander, no rover',
    landerId: 'generic-lander',
    roverId: null,
    note: 'The default requirements of the app.',
  },
  {
    id: 'generic-with-rover',
    name: 'Generic heavy lander with a small rover',
    landerId: 'generic-heavy-lander',
    roverId: 'generic-small-rover',
    note: 'Illustrative: the landing and survival come from the lander, the driving and its own autonomy from the rover.',
  },
]

export const DEFAULT_MISSION_ID = 'generic'

export const landerById = (id) => landers.find((l) => l.id === id) ?? null
export const roverById = (id) => rovers.find((r) => r.id === id) ?? null

/** The rovers a lander can carry. */
export const roversFor = (landerId) => rovers.filter((r) => r.carriedBy.includes(landerId))

export const isAntennaClass = (key) => Object.hasOwn(ANTENNAS, key)
