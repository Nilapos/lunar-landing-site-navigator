// From a mission (a lander, with a rover or not) to the requirements the analysis uses (see DEFAULT_REQUIREMENTS in verdict.js).
//
// Who sets what:
//   landing slope, landing sequence, antenna, data rate, link time, Earth elevation  -> the lander;
//   drive slope                                                                      -> the rover (none without a rover);
//   survival through the darkness, Sun elevation to charge -> both, and the weakest link counts: the mission lives as long as
//   its least enduring vehicle, and needs the highest Sun it asks for. The rover reaches Earth through the lander, so its
//   own link is not modeled.

/**
 * { requirements, origin, status }:
 *   requirements: the object used everywhere (same keys as DEFAULT_REQUIREMENTS, plus driveSlopeDeg, null without a rover);
 *   origin: where each key comes from, 'lander' | 'rover' | 'both' (both = the two vehicles agree), for the interface;
 *   status: 'hypothesis' when any vehicle of the mission has unsourced numbers, else 'sourced'.
 */
export function requirementsFor(lander, rover = null) {
  const origin = {
    minSunDeg: 'lander',
    minEarthDeg: 'lander',
    batteryHours: 'lander',
    linkMinPerHour: 'lander',
    bandwidthKbps: 'lander',
    antenna: 'lander',
    landingMinutes: 'lander',
    maxSlopeDeg: 'lander',
    driveSlopeDeg: rover ? 'rover' : 'lander',
  }
  let batteryHours = lander.power.survivalHours
  let minSunDeg = lander.power.minSunDeg
  if (rover) {
    if (rover.power.survivalHours < batteryHours) {
      batteryHours = rover.power.survivalHours
      origin.batteryHours = 'rover'
    } else if (rover.power.survivalHours === batteryHours) origin.batteryHours = 'both'
    if (rover.power.minSunDeg > minSunDeg) {
      minSunDeg = rover.power.minSunDeg
      origin.minSunDeg = 'rover'
    } else if (rover.power.minSunDeg === minSunDeg) origin.minSunDeg = 'both'
  }
  return {
    requirements: {
      minSunDeg,
      minEarthDeg: lander.comms.minEarthDeg,
      batteryHours,
      linkMinPerHour: lander.comms.linkMinPerHour,
      bandwidthKbps: lander.comms.dataRateNeededKbps,
      antenna: lander.comms.antenna,
      landingMinutes: lander.landing.sequenceMinutes,
      maxSlopeDeg: lander.landing.maxSlopeDeg,
      driveSlopeDeg: rover ? rover.mobility.maxDriveSlopeDeg : null,
    },
    origin,
    status: lander.status === 'sourced' && (!rover || rover.status === 'sourced') ? 'sourced' : 'hypothesis',
  }
}
