// Reference values of the vehicle catalog (vehicles.js): what a real vehicle gets when its maker publishes nothing for a number and no
// documented estimate exists. The Mission tab flags these values ("reference") and shows `from` when hovered. One place, so that every
// vehicle without a figure gets the same number and the same explanation.
//
// Keys are the names the Mission tab uses (the requirement keys of verdict.js, plus the three energy inputs, see solarSpec in vehicles.js).

export const REFERENCE_SOURCES = {
  spectrolab: { label: 'Spectrolab, XTJ Prime solar cell data sheet', url: 'https://www.spectrolab.com/photovoltaics/XTJ-Prime_Data_Sheet%20_07.27.22.pdf' },
  viperBriefing: {
    label: 'NASA, VIPER Industry Day technical briefing (Feb 2025)',
    url: 'https://assets.science.nasa.gov/content/dam/science/psd/lunar-science/documents/2025-02-13_VIPER_Updated_Technical_Briefing_Presentation-Shared.pdf',
  },
}

export const REFERENCES = {
  maxSlopeDeg: { value: 15, from: 'Default of the app: no published landing slope.' },
  landingMinutes: { value: 10, from: 'Default of the app: no published landing sequence.' },
  batteryHours: { value: 240, from: 'Default of the app: no published survival in the darkness.' },
  minSunDeg: { value: 0, from: 'Default of the app: the Sun counts as soon as it clears the terrain horizon.' },
  antenna: { value: 'mga', from: 'Default of the app: medium-gain antenna.' },
  bandwidthKbps: { value: 256, from: 'Default of the app: no published data rate.' },
  linkMinPerHour: { value: 30, from: 'Default of the app: no published link time.' },
  minEarthDeg: { value: 0, from: 'Default of the app: the Earth counts as soon as it clears the terrain horizon.' },
  driveSlopeDeg: { value: 15, from: "VIPER's published drive slope (NASA), used for rovers without a figure." },
  panelAreaM2: { value: 2, from: 'Same panel area as the generic lander of the app.' },
  panelEfficiency: {
    value: 0.28,
    from: 'Space solar cells: 30.7% new, 26.7% at end of life; 28% in between.',
    source: REFERENCE_SOURCES.spectrolab,
  },
  dailyNeedKWhLander: { value: 2.08, from: 'Same need as the generic lander of the app: 200 W for 8 h and 30 W for 16 h.' },
  dailyNeedKWhRover: {
    value: 2.6,
    from: "VIPER's hibernation: 5,420 Wh for 50 h = 108 W, for 24 h. Used for rovers without a figure; driving needs more.",
    source: REFERENCE_SOURCES.viperBriefing,
  },
}
