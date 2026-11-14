// Sites we can analyze: all inside the LOLA south polar map (80 S to the pole), east longitude in degrees.
//
// Every entry says where its coordinates come from. IMPORTANT: NASA names its Artemis III candidate regions
// (13 in 2022, 9 in 2024) but the sources we could open do not give their coordinates, and each region is
// about 15 km wide. The "artemis" entries are therefore single representative points, not NASA's official
// region centers. Replace them with NASA's table when the team has it.
// Terrain data for each site is precomputed by scripts/compute-horizons.mjs (rerun it after any change here).

export const SITE_GROUPS = [
  { key: 'artemis', label: 'Artemis III candidate regions (approximate points)' },
  { key: 'mission', label: 'Mission landing sites (landed or planned)' },
  { key: 'reference', label: 'Reference points (from the terrain map)' },
]

const SOURCE = {
  nasaRegions2022: { label: 'NASA SVS: 13 candidate regions (2022)', url: 'https://svs.gsfc.nasa.gov/5013' },
  nineRegions2024: {
    label: 'UPI: nine candidate regions (Oct 2024)',
    url: 'https://www.upi.com/Science_News/2024/10/28/nasa-artemis-moon-landing-regions/5971730152372/',
  },
  malapert: { label: 'Malapert (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Malapert_(crater)' },
  nobile: { label: 'Nobile (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Nobile_(crater)' },
  nobileStudy: {
    label: 'Published multi-criteria study on Artemis III sites',
    url: 'https://www.researchgate.net/publication/385942633_Evaluating_potential_landing_sites_for_the_Artemis_III_mission_using_a_multi-criteria_decision_making_approach',
  },
  lrocIm2: { label: 'LROC: IM-2 landing region (Feb 2025)', url: 'https://lroc.im-ldi.com/images/1401' },
  change7: { label: "Chang'e 7 (Wikipedia)", url: 'https://en.wikipedia.org/wiki/Chang%27e_7' },
  shackleton: { label: 'Shackleton (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Shackleton_(crater)' },
  lola: {
    label: 'LOLA LDEM_80S_80M (NASA PDS)',
    url: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_80s_80m.lbl',
  },
}

export const southPoleSites = [
  {
    id: 'malapert-massif',
    name: 'Malapert massif summit',
    group: 'artemis',
    lat: -85.988,
    lon: 2.053,
    note:
      'In both NASA candidate lists (2022 and 2024) as "Malapert Massif". Point = highest LOLA elevation within 10 km of 86 S 0 E ' +
      '(the peak lies almost exactly at 0 degrees longitude); the summit is 5172 m high in the map.',
    sources: [SOURCE.nasaRegions2022, SOURCE.nineRegions2024, SOURCE.malapert, SOURCE.lola],
  },
  {
    id: 'nobile-rim-2',
    name: 'Nobile Rim 2 (point from a published study)',
    group: 'artemis',
    lat: -84.20156,
    lon: 60.69989,
    note:
      'In the 2024 candidate list as "Nobile Rim 2". The coordinates (84 12 05.61 S, 60 41 59.61 E) come from a published ' +
      'multi-criteria study; I could only read a search excerpt of it, so please check it against the paper. On the rim of Nobile ' +
      '(79 km wide, centered at 85.28 S 53.27 E); 1123 m high in the map.',
    sources: [SOURCE.nineRegions2024, SOURCE.nobile, SOURCE.nobileStudy],
  },
  {
    id: 'mons-mouton-im2',
    name: 'Mons Mouton: IM-2 intended landing site',
    group: 'mission',
    lat: -84.78,
    lon: 29.13,
    note:
      'Intended site of Intuitive Machines IM-2 (160 km from the pole), in the Mons Mouton region, itself an Artemis III candidate ' +
      '(2024 list). IM-2 landed on 6 March 2025 about 250 m (Intuitive Machines) to 400 m (NASA) from this point and ended on its side. ' +
      '5312 m high in the map.',
    sources: [SOURCE.lrocIm2, SOURCE.nineRegions2024],
  },
  {
    id: 'change7-target',
    name: "Chang'e-7 planned site (Shackleton southeast ridge)",
    group: 'mission',
    lat: -88.8,
    lon: 123.4,
    note:
      "Planned landing site of China's Chang'e-7: the peak near the southeast ridge of Shackleton, on its illuminated rim. " +
      'Launch was set for 23-24 August 2026, then delayed (2027 planned, per Wikipedia; check for news). 1632 m high in the map.',
    sources: [SOURCE.change7, SOURCE.shackleton],
  },
  {
    id: 'shackleton-ridge',
    name: 'Ridge near Shackleton (highest point near the pole)',
    group: 'reference',
    lat: -89.507,
    lon: 221.748,
    note:
      'Highest LOLA point within 15 km of the pole (1886 m), on the ridge between Shackleton and de Gerlache. Consistent with NASA\'s ' +
      '"Connecting Ridge" candidate (2022 list) but NOT an official coordinate.',
    sources: [SOURCE.nasaRegions2022, SOURCE.lola],
  },
  {
    id: 'shackleton-floor',
    name: 'Shackleton crater floor (permanently shadowed)',
    group: 'reference',
    lat: -89.6667,
    lon: 129.7833,
    note:
      'Center of Shackleton (89 40 S 129 47 E, 21 km wide, 4.2 km deep). Its interior is permanently in shadow: a contrast case, ' +
      'not a landing candidate. -2784 m in the map.',
    sources: [SOURCE.shackleton, SOURCE.lola],
  },
]
