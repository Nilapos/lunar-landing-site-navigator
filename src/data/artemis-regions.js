// The 13 Artemis III candidate landing regions announced by NASA in August 2022, in the order of the six short
// segments of NASA SVS 5013 (names as written on the visuals). `siteId` links a region to one of our analyzable
// sites (south-pole-sites.js) when we have a sourced point for it; the others have no published coordinates in
// the sources we could open, so they are listed but not analyzed.

export const ARTEMIS_REGIONS_SOURCE = {
  label: 'NASA SVS 5013: Artemis III Landing Region Candidates (Aug 2022)',
  url: 'https://svs.gsfc.nasa.gov/5013',
}

export const NINE_REGIONS_2024_SOURCE = {
  label: 'UPI: nine candidate regions (Oct 2024)',
  url: 'https://www.upi.com/Science_News/2024/10/28/nasa-artemis-moon-landing-regions/5971730152372/',
}

export const artemisRegions = [
  { name: 'Connecting Ridge', siteId: null },
  { name: 'Connecting Ridge Extension', siteId: null },
  { name: 'de Gerlache Rim 1', siteId: null },
  { name: 'de Gerlache Rim 2', siteId: null },
  { name: 'Haworth', siteId: null },
  { name: 'Malapert Massif', siteId: 'malapert-massif' },
  { name: 'Leibnitz Beta Plateau', siteId: null },
  { name: 'Nobile Rim 1', siteId: null },
  { name: 'Nobile Rim 2', siteId: 'nobile-rim-2' },
  { name: 'Amundsen Rim', siteId: null },
  { name: 'Peak Near Shackleton', siteId: null },
  { name: 'Faustini Rim A', siteId: null },
  { name: 'de Gerlache-Kocher Massif', siteId: null },
]

// Why these regions, as said in the narration of NASA's video (SVS 5013).
export const selectionCriteria = [
  { title: 'Safe to land', text: 'Each region meets NASA’s safety requirements for landing.' },
  {
    title: 'Light and darkness side by side',
    text: 'Soaring mountains and deep craters: some places see nearly continuous sunlight, next to depressions that never see the Sun.',
  },
  { title: 'Resources', text: 'Each region offers opportunities to search for lunar resources.' },
  {
    title: 'Science',
    text: 'From mountain summits rising miles above their surroundings to the rims of large craters, the regions expose and preserve billions of years of geologic history.',
  },
]
