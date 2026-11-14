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
//     power: { survivalHours, minSunDeg },          // longest darkness it survives; Sun at least this high over the horizon to charge
//     comms: { antenna, dataRateNeededKbps, linkMinPerHour, minEarthDeg },  // antenna class (see ANTENNAS in scores.js), data it must send,
//                                                   // Earth link needed per hour, Earth at least this high (antenna pointing)
//   }
//   rover = {
//     id, name, agency, status, note, sources,
//     massKg, carriedBy: [lander ids],
//     mobility: { maxDriveSlopeDeg },               // steepest slope it can drive
//     power: { survivalHours, minSunDeg },          // same meaning as for the lander
//   }
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
    power: { survivalHours: 240, minSunDeg: 0 },
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
    power: { survivalHours: 336, minSunDeg: 1 },
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
    power: { survivalHours: 120, minSunDeg: 2 },
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
