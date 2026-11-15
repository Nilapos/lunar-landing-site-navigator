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
// (https links). The "generic" entries below are hypotheses: the generic lander reproduces the default requirements of the app.
//
// WHERE EACH NUMBER COMES FROM. Makers publish only part of what the analysis needs, so a real vehicle also says, for each number,
// where it comes from (`values`, read with valueOrigin): 'published' (official figure), 'estimate' (worked out from a documented
// figure, `from` says which and how) or 'reference' (nothing documented: the value of vehicleReferences.js). A number missing from
// `values` is a reference. The Mission tab shows the origin of every number and lets the user type their own.
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
//     values: { [key]: { origin, from, source } },  // origin of the numbers, keys as in the Mission tab (see valueOrigin)
//     energyNote,                                   // why energy is null, when it is
//   }
//   rover = {
//     id, name, agency, status, note, sources, values, energyNote,
//     massKg, carriedBy: [lander ids],
//     mobility: { maxDriveSlopeDeg },               // steepest slope it can drive
//     power: { survivalHours, minSunDeg, energy },  // same meaning as for the lander
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
//   The real vehicles build it with solarSpec from three numbers: panel area, efficiency and the energy needed per day.
//   mission = { id, name, landerId, roverId | null, note }
import { neededWhPerDay } from '../lib/energy.js'
import { ANTENNAS } from '../lib/scores.js'
import { REFERENCE_SOURCES, REFERENCES as R } from './vehicleReferences.js'

export const STATUSES = ['sourced', 'hypothesis']
export const ORIGINS = ['published', 'estimate', 'reference']

/**
 * The power.energy spec of energy.js from the three numbers the Mission tab shows: panel area (m2), cell efficiency (0..1) and the
 * energy the vehicle needs per day (kWh), drawn evenly over 24 h (so neededWhPerDay gives it back). The charge efficiency and the panel
 * orientation are those of the generic vehicles (hypotheses): 0.9, and vertical panels facing the Sun.
 */
export function solarSpec({ panelAreaM2, panelEfficiency, dailyNeedKWh, batteryWh = null }) {
  return {
    panelAreaM2,
    panelEfficiency,
    chargeEfficiency: 0.9,
    batteryWh,
    consumption: { operatingW: (dailyNeedKWh * 1000) / 24, survivalW: 0, operatingHoursPerDay: 24 },
    panel: { mode: 'vertical-tracking' },
  }
}

/** The three numbers of the Mission tab from any power.energy spec: { panelAreaM2, panelEfficiency (0..1), dailyNeedKWh }. */
export function solarInputs(spec) {
  return { panelAreaM2: spec.panelAreaM2, panelEfficiency: spec.panelEfficiency, dailyNeedKWh: neededWhPerDay(spec.consumption) / 1000 }
}

const solarReference = (kind, numbers = {}) =>
  solarSpec({
    panelAreaM2: R.panelAreaM2.value,
    panelEfficiency: R.panelEfficiency.value,
    dailyNeedKWh: kind === 'rover' ? R.dailyNeedKWhRover.value : R.dailyNeedKWhLander.value,
    ...numbers,
  })

const published = (from, source) => ({ origin: 'published', from, source })
const estimate = (from, source) => ({ origin: 'estimate', from, source })
const reference = (from) => ({ origin: 'reference', from }) // a reference value with a word about this vehicle

const SOURCES = {
  astroboticGuide: {
    label: "Astrobotic, Lunar Landers Payload User's Guide v5.0 (Aug 2021)",
    url: 'https://science.nasa.gov/wp-content/uploads/2023/11/astrobotic-lunar-landers-pug.pdf',
  },
  griffin: { label: 'Astrobotic, Griffin lander', url: 'https://www.astrobotic.com/lunar-delivery/landers/griffin-lander/' },
  blueMoon: { label: 'Blue Origin, Blue Moon Mark 1', url: 'https://www.blueorigin.com/blue-moon/mark-1' },
  blueMoonPathfinder: {
    label: 'Wikipedia, Blue Moon Pathfinder Mission 1 (goals stated by Blue Origin)',
    url: 'https://en.wikipedia.org/wiki/Blue_Moon_Pathfinder_Mission_1',
  },
  imLpsc: { label: 'Intuitive Machines, LPSC 2024 abstract 1931', url: 'https://www.hou.usra.edu/meetings/lpsc2024/pdf/1931.pdf' },
  imIm2: { label: 'Intuitive Machines, IM-2 mission', url: 'https://www.intuitivemachines.com/im-2' },
  novaCWikipedia: { label: 'Wikipedia, Nova-C (not official: power, battery)', url: 'https://en.wikipedia.org/wiki/Intuitive_Machines_Nova-C' },
  blueGhost: { label: 'Firefly, Blue Ghost', url: 'https://fireflyspace.com/blue-ghost/' },
  blueGhostMission1: { label: 'Firefly, Blue Ghost Mission 1', url: 'https://fireflyspace.com/missions/blue-ghost-mission-1/' },
  blueGhostComms: {
    label: 'SatNews, Vulcan Wireless on Blue Ghost Mission 1 communications (Mar 2025)',
    url: 'https://satnews.com/2025/03/03/vulcan-wireless-assists-u-s-return-to-the-moon-after-52-years-with-record-breaking-lunar-communications-on-blue-ghost-mission-1/',
  },
  hls: { label: 'NASA, Artemis HLS Update 2024', url: 'https://ntrs.nasa.gov/api/citations/20240009596/downloads/ArtemisHLSUpdate_2024.pdf' },
  hlsCargo: {
    label: 'AmericaSpace, Starship lunar performance (Apr 2024)',
    url: 'https://www.americaspace.com/2024/04/20/starship-faces-performance-shortfall-for-lunar-missions/',
  },
  viper: { label: 'NASA, VIPER in depth', url: 'https://science.nasa.gov/mission/viper/in-depth/' },
  viperOperations: { label: 'NASA, VIPER lunar operations', url: 'https://science.nasa.gov/mission/viper/lunar-operations/' },
  viperBriefing: REFERENCE_SOURCES.viperBriefing,
  viperDelivery: {
    label: 'NASA, Blue Origin to deliver VIPER',
    url: 'https://www.nasa.gov/news-release/nasa-selects-blue-origin-to-deliver-viper-rover-to-moons-south-pole/',
  },
  flip: {
    label: 'Astrolab, FLIP joins Griffin-1 (Feb 2025)',
    url: 'https://www.astrolab.space/2025/02/05/astrolabs-flip-rover-joins-astrobotics-griffin-1-to-the-moon/',
  },
  rovers2026: {
    label: 'Spaceflight Now, next-gen astronaut Moon rovers (Jun 2026)',
    url: 'https://spaceflightnow.com/2026/06/26/next-gen-astronaut-moon-rovers-aim-for-deployment-ahead-of-artemis-4-crew-arrival/',
  },
  clv1: {
    label: 'Astrolab, NASA selects Astrolab (May 2026)',
    url: 'https://www.astrolab.space/2026/05/26/nasa-selects-astrolab-to-provide-lunar-rover-for-artemis-astronauts-return-to-the-moon/',
  },
  moonBaseUpdate: { label: 'NASA, Moon Base update', url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-moon-base-rovers-landers-missions/' },
  moonBaseSystems: { label: 'NASA, Moon Base systems (Lunar Terrain Vehicle requirements)', url: 'https://www.nasa.gov/moonbase-systems/' },
}

const LTV_SURVIVAL = estimate('NASA requirement for the first Lunar Terrain Vehicles: survive up to 150 h in shadow.', SOURCES.moonBaseSystems)
const LTV_SLOPE = estimate('NASA requirement for the first Lunar Terrain Vehicles: slopes up to 20°.', SOURCES.moonBaseSystems)

export const landers = [
  {
    id: 'generic-lander',
    name: 'Generic lander (hypothesis)',
    agency: 'none',
    status: 'hypothesis',
    note: 'Placeholder that reproduces the default requirements of the app: a base reference to compare the real vehicles with.',
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
  {
    id: 'griffin',
    name: 'Griffin',
    agency: 'Astrobotic',
    status: 'sourced',
    note: 'Commercial lander (NASA CLPS) with side-mounted solar panels for the poles. Griffin Mission One carries the FLIP rover.',
    sources: [SOURCES.astroboticGuide, SOURCES.griffin],
    massKg: null,
    payloadCapacityKg: 625,
    landing: { maxSlopeDeg: 10, ellipseM: 100, sequenceMinutes: R.landingMinutes.value },
    power: { survivalHours: R.batteryHours.value, minSunDeg: R.minSunDeg.value, energy: solarReference('lander') },
    comms: { antenna: 'hga', dataRateNeededKbps: R.bandwidthKbps.value, linkMinPerHour: R.linkMinPerHour.value, minEarthDeg: R.minEarthDeg.value },
    values: {
      payloadCapacityKg: published('625 kg to the lunar surface in the polar configuration.', SOURCES.astroboticGuide),
      ellipseM: published('Landing ellipse of 100 m x 100 m.', SOURCES.astroboticGuide),
      maxSlopeDeg: published('Landing sites are selected with an effective slope of 10° or less.', SOURCES.astroboticGuide),
      landingMinutes: reference("Default of the app. Astrobotic's guide gives a powered descent of 2 h; not used until the team decides."),
      batteryHours: reference("Default of the app. Astrobotic's guide gives no survival figure; its thermal range excludes the lunar night."),
      antenna: published('Direct-to-Earth link in X-band.', SOURCES.astroboticGuide),
      bandwidthKbps: reference('Default of the app. The guide gives 10 kbps per kg of payload while payloads are attached, not a need of the lander.'),
      panelAreaM2: reference("Same area as the generic lander. The guide's 1 W per kg of payload means at least 1.64 m2 for a full load (625 W)."),
    },
  },
  {
    id: 'blue-moon-mk1',
    name: 'Blue Moon MK1',
    agency: 'Blue Origin',
    status: 'sourced',
    note: 'Cargo lander. It delivers VIPER (mission MK1-102) and the two Lunar Terrain Vehicles (MK1-103 and MK1-104).',
    sources: [SOURCES.blueMoon, SOURCES.blueMoonPathfinder],
    massKg: null,
    payloadCapacityKg: 3000,
    landing: { maxSlopeDeg: R.maxSlopeDeg.value, ellipseM: 100, sequenceMinutes: R.landingMinutes.value },
    power: { survivalHours: R.batteryHours.value, minSunDeg: R.minSunDeg.value, energy: null },
    comms: { antenna: R.antenna.value, dataRateNeededKbps: R.bandwidthKbps.value, linkMinPerHour: R.linkMinPerHour.value, minEarthDeg: R.minEarthDeg.value },
    values: {
      payloadCapacityKg: published('Up to 3 t to the lunar surface.', SOURCES.blueMoon),
      ellipseM: estimate("Blue Origin's goal for the MK1 pathfinder: landing within 100 m of the target.", SOURCES.blueMoonPathfinder),
    },
    energyNote: 'Not modeled: Blue Moon MK1 runs on a hydrogen and oxygen fuel cell, not on solar panels.',
  },
  {
    id: 'nova-c',
    name: 'Nova-C',
    agency: 'Intuitive Machines',
    status: 'sourced',
    note: 'Commercial lander (NASA CLPS). Flew IM-1 (Odysseus, 2024) and IM-2 (Athena, 2025, near the south pole).',
    sources: [SOURCES.imLpsc, SOURCES.imIm2, SOURCES.novaCWikipedia],
    massKg: null,
    payloadCapacityKg: 130,
    landing: { maxSlopeDeg: 10, ellipseM: null, sequenceMinutes: R.landingMinutes.value },
    power: { survivalHours: 10, minSunDeg: R.minSunDeg.value, energy: solarReference('lander', { panelAreaM2: 0.52 }) },
    comms: { antenna: 'mga', dataRateNeededKbps: R.bandwidthKbps.value, linkMinPerHour: R.linkMinPerHour.value, minEarthDeg: R.minEarthDeg.value },
    values: {
      payloadCapacityKg: published('Payload of more than 130 kg.', SOURCES.imLpsc),
      maxSlopeDeg: published('Lands on slopes up to 10°.', SOURCES.imLpsc),
      batteryHours: estimate('IM-1: Intuitive Machines expected 10 to 20 h of link after sunset on the battery; the low end is kept.', SOURCES.novaCWikipedia),
      antenna: estimate('S-band link to the Lunar Data Network of Intuitive Machines: medium-gain class.', SOURCES.imIm2),
      panelAreaM2: estimate('200 W peak from 3 panels: 200 / (1361 x 0.28) = 0.52 m2.', SOURCES.novaCWikipedia),
    },
  },
  {
    id: 'blue-ghost',
    name: 'Blue Ghost',
    agency: 'Firefly Aerospace',
    status: 'sourced',
    note: 'Commercial lander (NASA CLPS). Mission 1 landed in Mare Crisium in March 2025.',
    sources: [SOURCES.blueGhost, SOURCES.blueGhostMission1, SOURCES.blueGhostComms],
    massKg: null,
    payloadCapacityKg: 240,
    landing: { maxSlopeDeg: R.maxSlopeDeg.value, ellipseM: null, sequenceMinutes: R.landingMinutes.value },
    power: { survivalHours: 5, minSunDeg: R.minSunDeg.value, energy: solarReference('lander', { panelAreaM2: 1.05 }) },
    comms: { antenna: 'hga', dataRateNeededKbps: R.bandwidthKbps.value, linkMinPerHour: R.linkMinPerHour.value, minEarthDeg: R.minEarthDeg.value },
    values: {
      payloadCapacityKg: published('Payload up to 240 kg.', SOURCES.blueGhost),
      batteryHours: published('Mission 1 operated about 5 h into the lunar night.', SOURCES.blueGhostMission1),
      antenna: estimate('One X-band and three S-band antennas on Mission 1 (Vulcan Wireless, its supplier): high-gain X-band class.', SOURCES.blueGhostComms),
      panelAreaM2: estimate('400 W peak from 3 panels: 400 / (1361 x 0.28) = 1.05 m2.', SOURCES.blueGhost),
    },
  },
  {
    id: 'starship-hls',
    name: 'Starship HLS',
    agency: 'SpaceX',
    status: 'sourced',
    note: 'Human Landing System of Artemis III: the crewed lander.',
    sources: [SOURCES.hls, SOURCES.hlsCargo],
    massKg: null,
    payloadCapacityKg: 100000,
    landing: { maxSlopeDeg: 10, ellipseM: null, sequenceMinutes: R.landingMinutes.value },
    power: { survivalHours: R.batteryHours.value, minSunDeg: R.minSunDeg.value, energy: null },
    comms: { antenna: R.antenna.value, dataRateNeededKbps: R.bandwidthKbps.value, linkMinPerHour: R.linkMinPerHour.value, minEarthDeg: R.minEarthDeg.value },
    values: {
      payloadCapacityKg: estimate("SpaceX's claim: 100 t of cargo to the lunar surface.", SOURCES.hlsCargo),
      maxSlopeDeg: published('NASA requirement: landing surface slope under 10° over 100 m.', SOURCES.hls),
    },
    energyNote: 'Not modeled: no power figures are published, and the reference values would mean nothing for a 50 m crewed ship.',
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
  {
    id: 'viper',
    name: 'VIPER',
    agency: 'NASA',
    status: 'sourced',
    note: 'Rover that searches for water ice near the south pole. It talks to Earth itself in X-band (here, through the lander, like every rover).',
    sources: [SOURCES.viper, SOURCES.viperOperations, SOURCES.viperBriefing, SOURCES.viperDelivery],
    massKg: 450,
    carriedBy: ['blue-moon-mk1'],
    mobility: { maxDriveSlopeDeg: 15 },
    power: { survivalHours: 96, minSunDeg: R.minSunDeg.value, energy: solarReference('rover', { panelAreaM2: 1.18, batteryWh: 5420 }) },
    values: {
      massKg: published('450 kg.', SOURCES.viper),
      driveSlopeDeg: published('Drives slopes up to 15° normally, 25 to 30° when necessary.', SOURCES.viper),
      batteryHours: published('A darkness longer than four Earth days (96 h) ends the mission.', SOURCES.viperOperations),
      batteryWh: published('Battery of 5,420 Wh.', SOURCES.viperBriefing),
      panelAreaM2: estimate('450 W from the corner-facing array: 450 / (1361 x 0.28) = 1.18 m2.', SOURCES.viperBriefing),
      dailyNeedKWh: estimate('Hibernation floor: 5,420 Wh for 50 h = 108 W, for 24 h. Driving needs more.', SOURCES.viperBriefing),
    },
  },
  {
    id: 'flip',
    name: 'FLIP',
    agency: 'Astrolab',
    status: 'sourced',
    note: 'Test rover for the crewed rovers of Astrolab, carried by Griffin Mission One. Payload of 30 kg.',
    sources: [SOURCES.flip, SOURCES.moonBaseUpdate, SOURCES.rovers2026],
    massKg: 500,
    carriedBy: ['griffin'],
    mobility: { maxDriveSlopeDeg: R.driveSlopeDeg.value },
    power: { survivalHours: 100, minSunDeg: R.minSunDeg.value, energy: solarReference('rover') },
    values: {
      massKg: published('Nearly half a metric ton.', SOURCES.flip),
      batteryHours: estimate('Designed to survive 100 hours of lunar night conditions (press).', SOURCES.rovers2026),
    },
  },
  {
    id: 'clv-1',
    name: 'CLV-1',
    agency: 'Astrolab',
    status: 'sourced',
    note: 'Lunar Terrain Vehicle for the Artemis astronauts, adapted from the FLEX rover. 10 km/h on level ground.',
    sources: [SOURCES.clv1, SOURCES.moonBaseSystems, SOURCES.blueMoon],
    massKg: 950,
    carriedBy: ['blue-moon-mk1'],
    mobility: { maxDriveSlopeDeg: 20 },
    power: { survivalHours: 150, minSunDeg: R.minSunDeg.value, energy: solarReference('rover') },
    values: {
      massKg: published('Maximum mass of 950 kg (NASA gives about 2,000 lb).', SOURCES.clv1),
      batteryHours: LTV_SURVIVAL,
      driveSlopeDeg: LTV_SLOPE,
    },
  },
  {
    id: 'pegasus',
    name: 'Pegasus',
    agency: 'Lunar Outpost',
    status: 'sourced',
    note: 'Lunar Terrain Vehicle for the Artemis astronauts, evolved from the Eagle rover. Operational for up to a year.',
    sources: [SOURCES.moonBaseUpdate, SOURCES.moonBaseSystems, SOURCES.blueMoon],
    massKg: null,
    carriedBy: ['blue-moon-mk1'],
    mobility: { maxDriveSlopeDeg: 20 },
    power: { survivalHours: 150, minSunDeg: R.minSunDeg.value, energy: solarReference('rover') },
    values: {
      batteryHours: LTV_SURVIVAL,
      driveSlopeDeg: LTV_SLOPE,
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
  { id: 'griffin-flip', name: 'Griffin + FLIP', landerId: 'griffin', roverId: 'flip', note: 'Griffin Mission One (Astrobotic) delivers the FLIP rover of Astrolab.' },
  { id: 'mk1-viper', name: 'Blue Moon MK1 + VIPER', landerId: 'blue-moon-mk1', roverId: 'viper', note: "Blue Origin delivers NASA's VIPER to the south pole (MK1-102)." },
  { id: 'mk1-clv1', name: 'Blue Moon MK1 + CLV-1', landerId: 'blue-moon-mk1', roverId: 'clv-1', note: 'Lunar Terrain Vehicle of Astrolab, delivered by Blue Moon MK1.' },
  { id: 'mk1-pegasus', name: 'Blue Moon MK1 + Pegasus', landerId: 'blue-moon-mk1', roverId: 'pegasus', note: 'Lunar Terrain Vehicle of Lunar Outpost, delivered by Blue Moon MK1.' },
  { id: 'nova-c', name: 'Nova-C', landerId: 'nova-c', roverId: null, note: 'Intuitive Machines lander alone (NASA CLPS).' },
  { id: 'blue-ghost', name: 'Blue Ghost', landerId: 'blue-ghost', roverId: null, note: 'Firefly lander alone (NASA CLPS).' },
  { id: 'starship-hls', name: 'Starship HLS', landerId: 'starship-hls', roverId: null, note: 'Crewed lander of Artemis III (SpaceX).' },
]

export const DEFAULT_MISSION_ID = 'generic'

export const landerById = (id) => landers.find((l) => l.id === id) ?? null
export const roverById = (id) => rovers.find((r) => r.id === id) ?? null

/** The rovers a lander can carry. */
export const roversFor = (landerId) => rovers.filter((r) => r.carriedBy.includes(landerId))

export const isAntennaClass = (key) => Object.hasOwn(ANTENNAS, key)

/**
 * Where one number of a vehicle comes from: { origin: 'published' | 'estimate' | 'reference', from, source? }.
 *   key: a requirement key of verdict.js (maxSlopeDeg, batteryHours, driveSlopeDeg...), one of the three energy inputs (panelAreaM2,
 *   panelEfficiency, dailyNeedKWh) or a fact (payloadCapacityKg, massKg, ellipseM, batteryWh).
 * A number the vehicle does not describe is a reference (vehicleReferences.js); every number of a placeholder vehicle is one.
 */
export function valueOrigin(vehicle, key) {
  const own = vehicle.values?.[key]
  if (own) return own
  if (vehicle.status === 'hypothesis') return { origin: 'reference', from: 'Placeholder vehicle: illustrative number, not sourced.' }
  const rover = 'mobility' in vehicle
  const ref = R[key === 'dailyNeedKWh' ? (rover ? 'dailyNeedKWhRover' : 'dailyNeedKWhLander') : key]
  return ref ? { origin: 'reference', from: ref.from, source: ref.source } : { origin: 'reference', from: 'Not published.' }
}

/** One line for the interface: why this number, and its source (an origin of valueOrigin). */
export const originText = ({ from, source }) => `${from}${source ? ` Source: ${source.label}.` : ''}`
