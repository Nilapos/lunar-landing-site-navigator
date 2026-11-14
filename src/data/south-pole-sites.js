// Candidate south pole sites (east longitude, degrees). The challenge focuses on the south polar region.
//
// STATUS: demo set. The first two points are taken from the LOLA elevation map itself (extremes
// within 15 km of the pole) so they are guaranteed to match the terrain data; Malapert is a
// well-known massif whose coordinates are approximate. Replace or extend this list with official
// CLPS / Artemis candidate coordinates (and keep `source` up to date).
export const southPoleSites = [
  {
    id: 'pole-ridge',
    name: 'Ridge near Shackleton (LOLA high point)',
    lat: -89.507,
    lon: 221.748,
    source: 'Highest point within 15 km of the pole in LDEM_80S_80M (+1885 m)',
  },
  {
    id: 'shackleton-interior',
    name: 'Shackleton crater interior (LOLA low point)',
    lat: -89.625,
    lon: 118.82,
    source: 'Lowest point within 15 km of the pole in LDEM_80S_80M (-2868 m)',
  },
  {
    id: 'malapert-massif',
    name: 'Malapert massif',
    lat: -85.99,
    lon: 0.0,
    source: 'Approximate literature coordinates; summit is +4829 m in LDEM_80S_80M',
  },
]
