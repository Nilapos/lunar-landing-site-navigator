# Lunar Landing Site Navigator

Web app for the NASA Space Apps Challenge 2026, challenge "Lunar Landing Site Navigator":
https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

Goal: let mission planners, educators and the public compare landing sites and dates quickly by
showing where the **Sun and Earth are relative to the local horizon** (terrain included) to judge
**power** (sunlight windows, solar elevation, time before sunset) and **direct-to-Earth
communication** (Earth visibility windows, time before Earthset).

Scope: the **lunar south polar region only** (80S to the pole), not the whole Moon.

## How the data works

- `/api/horizons` (`api/horizons.js`, logic in `src/lib/horizons.js`): Sun and Earth azimuth/elevation
  over time for a point on the Moon, from JPL Horizons (called server-side, it has no CORS).
  Elevations are relative to a smooth sphere, so they ignore terrain.
- `src/lib/terrain.js`: horizon profile (360 values, one per degree of azimuth, 0 = north) from the
  LOLA south pole elevation map. Profiles are precomputed by `scripts/compute-horizons.mjs` into
  `src/data/horizon-profiles.json`. The 115 MB source map is NOT in the repo (download link in the script).
- `src/lib/visibility.js`: combines both: a body is visible when its elevation is above the horizon
  profile at its azimuth. Gives visibility windows, fractions and time to sunset/Earthset.
- Sites live in `src/data/south-pole-sites.js` (grouped: Artemis III regions, mission sites, reference points), missions in
  `src/data/missions.js`. **Every coordinate must have a source; never invent one.** NASA's official Artemis III region
  centers are not in the sources we could open, so those entries are representative points (flagged as approximate).
  After changing the site list, rerun `scripts/compute-horizons.mjs` (a test fails if horizons or slopes are missing).
  `scripts/find-rim-points.mjs` checks sourced points against the LOLA map.
- A **scenario** = a site + a landing date + a period. `src/lib/scenario.js` turns a scenario's series into
  Sun / Earth / "both at once" windows and metrics, and compares two scenarios (`compareScenarios`).
  `src/lib/useScenario.js` (hook, with `useEphemeris.js`) loads and analyzes one scenario.
- `src/lib/verdict.js` + `src/lib/scores.js`: green / orange / red verdicts and /100 scores (Solar Exposure,
  Telecom, Window Duration, Topography, Global = average) by comparing measured values with the rover
  requirements typed in `RequirementsPanel`. One rule everywhere: ratio = offered / needed, score =
  100 x min(ratio / 2, 1) (50 = just met), green from ratio 1.2. No home-made formulas.
- Slopes: `slopeStats` in `terrain.js` (LOLA 80 m, within 100 m of the site), precomputed with the horizons
  into `src/data/site-terrain.json` by `scripts/compute-horizons.mjs` (rerun it when sites change).
- Map: `public/south-pole-hillshade.png` is a hillshade of the LOLA map made by `scripts/render-map.mjs`; `src/lib/polarMap.js`
  projects lat/lon on it (lon 0 up, 90 E right). `SitesOverview` (+ `PolarMap`) shows every site on the map and in a ranking by
  global score, computed by `useSitesOverview` (Horizons is queried one site at a time: it rejects simultaneous requests).
- 3D view (`PolarSky` -> `src/lib/polarSkyScene.js` and `src/lib/terrainScene.js` for colors and labels, three.js): relief mesh from a 256x256 grid
  (`public/south-pole-heights.bin`, `south-pole-slope.bin`, built by `scripts/build-3d-data.mjs`), the hillshade as texture,
  site pins, and layers painted on the ground: forbidden zones (slope above the rover limit) and, for a moment chosen with
  a slider, sunlight / shadows and Earth visibility. three.js is the only 3D dependency and is only downloaded when the
  user opens the 3D view. The mouse wheel zooms only after a click on the view.
- Layers on the whole terrain: `/api/sky` (`api/sky.js`) gives, over time, the point of the Moon under the Sun and under
  the Earth and the Earth distance (Horizons); `src/lib/sky.js` turns that into az/el at any point (validated against
  Horizons' own per-site az/el to 0.001 deg); `src/lib/horizonGrid.js` + `scripts/build-horizon-grid.mjs` precompute the
  terrain horizon of every 2.4 km cell (`public/south-pole-horizon.bin`, 72 azimuths); `src/lib/illumination.js` paints
  one instant. It is an overview (cells of 2.4 km): near the pole, on summits and slopes, a cell can differ from the
  precise per-site analysis (99-100% agreement on smooth terrain).
- Polar sky view (phase A of `BRIEF-V2.md`, done): `PolarSky` is the only 3D view (the old Terrain view is gone: its "from above" look is the "top" camera), fed by one
  timeline (`src/lib/useTimeline.js`) and one ground painting (`src/lib/groundTexture.js`). `src/lib/polarSky.js` (tested) holds the
  geometry and wording (cap vertices on the sphere, true direction and angular size of the bodies, cause text), `src/lib/cellProbe.js`
  (tested) the hover card of a 2.4 km cell (rules of `verdict.js` / `scores.js`), `src/lib/polarSkyScene.js` the three.js scene with
  two cameras: orbit, and standing on the site of scenario A with its real horizon profile as the skyline. Earth, Sun glare and
  ground textures are drawn by code (`src/lib/skyTextures.js`): stylized, no downloaded asset.
- Dashboard shell (BRIEF-V2 phases B to E, then the minimal redesign of 2026-11-14): `App.jsx` composes `Shell` (slim top bar with a site chip, rail of tabs
  Sky / On site / Why / Analysis / Sites, with Settings and Missions as drawers at the foot of the rail, `TimelineBar` at the bottom). Desktop browsers only, no phone layout. The sky and site tabs share one `PolarSky` element (the scene stays alive); the camera has three modes (`orbit`, `top`, `site`) and the orbit/top move is an animated flight (`setOrbitPose` in `polarSkyScene.js`). `ScoreCard` is the one card of the view (global score, four gauges, Sun and Earth in words, details). The "Why" tab
  (`Why`, `SkyChart`, `CauseStrip`, `RayDiagram`) uses the pure `src/lib/cause.js`. "Scores follow the timeline" uses
  `src/lib/momentScores.js` (scores measured after the moment shown). The pitch demo button and its checked numbers are in `App.jsx`.
  `README.md` is the page for the jury and `SUBMISSION.md` the checklist of what the team still has to deliver.
- Fine zones (2.4 km overview, then 100-250 m cells): `scripts/build-zones.mjs <ldem_80s_*.img> [--cell 125] [--size 16]` writes, for each
  analyzable site, `public/zones/<id>.json|bin|png` (heights, slope, 72-azimuth horizon per cell, and a hillshade). `src/lib/zones.js` (tested)
  parses them and builds the patch geometry; `useZone` loads one when the camera comes within about 90 km of the selected site (`near`,
  reported by `polarSkyScene.js`); `paintZone` paints the same layers on its cells and `paintGround` cuts a hole in the overview texture
  under it. The "Zoom to site" button flies the camera down to it. `createDemAuto` (terrain.js) reads any LDEM_80S product (80, 40 or 20 m).
  The committed zones come from the 80 m map (250 m cells); rebuild them with the 20 m map (`LOLA data/ldem_80s_20m/`, 1.85 GB) for 125 m
  cells. The other scripts (compute-horizons, build-3d-data, build-horizon-grid, render-map) still assume the 80 m map.
- Best landing areas (`src/lib/bestAreas.js`, tested; `BestAreas` card in the sky view): `findBestAreas` takes the share of the period each 2.4 km
  cell is optimal (`goFractions`), judges the best ~400 cells like sites (`probeCell`, same rules and scores as verdict.js), keeps distinct areas
  15 km apart, only south of 83 S (near the map edge the horizon walk is cut short). Clicking an area flies the camera there; the scene marks the
  areas with numbered neon rings (`setRankMarkers`, `flyTo` in polarSkyScene.js).
- 500 m grid (level between the 2.4 km overview and the site zones): `scripts/build-fine-grid.mjs <ldem_80s_*.img> [--cell 500]` writes
  `public/grid500/index.json` and one gzip file per 16 km chunk (heights, slope, delta-coded 72-azimuth horizon) for everything south of 83 S
  (about 600 chunks, 43 MB raw, 15-18 MB compressed). `src/lib/fineGrid.js` (tested) decodes a chunk as a "zone" (zones.js), `useFineChunks`
  loads the ~80 chunks around the point the camera looks at (reported by `polarSkyScene.js` through `onView`), and `paintGround` repaints each
  loaded chunk at its own resolution on the 2048 px ground texture. Without the data files the app simply stays on the 2.4 km overview.
  Rule agreed 2026-11-14: build it ONCE from the 20 m map and commit that single version (each committed regeneration adds a full copy to
  the history). Until then `public/grid500/` is excluded locally in `.git/info/exclude` and must not be committed.
- Selected points (`src/lib/pointSite.js`, tested): a click on the ground of the sky view selects that place as the site of scenario A
  (`pointSite` builds a site with `custom: true`, a 360-value horizon and slope statistics taken from the 500 m cell when its chunk is loaded,
  else from the 2.4 km cell). `useScenario(..., customSite)`, `SiteControls`, `PolarSky` and `ScoreCard` accept it; the real ephemeris is
  fetched for the clicked point, so the whole period is analyzed (score card, Why, Analysis, On site). It is approximate and flagged so.
  Hovering still shows the quick probe card; clicking replaces the old "pin the card" behavior.
- Mission = lander (+ optional rover) (`src/data/vehicles.js`, schema documented at the top of the file; `src/lib/missionRequirements.js`,
  tested): `requirementsFor(lander, rover)` gives the requirements the analysis uses. Landing slope, landing sequence, antenna, data rate and
  link time come from the lander; the drive slope from the rover (`driveSlopeDeg`, null without a rover); survival through the darkness and
  Sun elevation take the weakest vehicle. A rover lists the landers that can carry it (`carriedBy`). Entries are `status: sourced` (with https
  sources) or `hypothesis` (flagged in the Mission tab); the two generic entries reproduce `DEFAULT_REQUIREMENTS` exactly. `App.jsx` keeps
  `mission` and `overrides` (values typed in Settings) and derives `requirements`. The terrain verdict adds a rover term: 90% of the ground
  within 500 m must be under the drive slope. Teo fills the catalog and styles the Mission tab (`MissionTab.jsx`).
- Feasible layer (`src/lib/feasibility.js`, `useFeasibility.js`, tested): a fourth mode next to Optimal. A cell is feasible when it meets the power
  (battery / longest darkness), link (time and antenna rate) and terrain (landing slope, plus the rover drive slope) requirements over the whole
  period, with the verdict rules of verdict.js (worst ratio: ok from 1.2, marginal from 1, fail below). The period is sampled (90 samples), the
  2.4 km map is computed in slices by `useFeasibility`, the 500 m chunks and the zones synchronously (cached). The landing window is not part of it.
  The score card now says what holds a site back (`Blockers` in ScoreCard.jsx): the verdict is the worst requirement, not the average score.
- Real Moon around the polar cap: two LRO WAC mosaics from NASA Moon Trek (public WMTS, CORS open), stitched once from tile level 3 and committed:
  `public/moon-wac-4096.jpg` (global, equirectangular, layer LRO_WAC_Mosaic_Global_303ppd_v02) and `public/moon-wac-south-2048.jpg` (south polar,
  polar stereographic, layer LRO_WAC_Mosaic_SPole60_100m_v02). `polarSkyScene.js` draws the sphere in two meshes meeting 33 degrees from the pole
  (`southPolarUv` in polarSky.js gives the coordinates of the ring); the picture drawn by code (skyTextures.js) stays as the fallback if a file is
  missing. Credit: NASA/GSFC/Arizona State University (LRO WAC), via NASA Moon Trek.
- Data build order after changing the LOLA inputs or the grid: `build-3d-data.mjs`, then `build-horizon-grid.mjs`.
- UI: `App.jsx` (compare toggle) -> `ScenarioPanel` (controls, Sun and Earth cards, `SkyView`, `ElevationChart`)
  x1 or x2, plus `ComparisonTable` (A vs B, better value highlighted).
- Artemis III identity (2026-11-14, Teo): the art direction follows NASA's Artemis III landing region videos (SVS 5013): candidate
  regions as translucent teal squares (~15 km, `regionSquare` in `polarMap.js`) with a cyan edge and a white bold name, a lavender
  polar graticule (`GRID_LATS` / `GRID_LONS`), black and neutral lunar greys. `groundTexture.js` paints the graticule and the region
  squares on the 3D ground (optional `overlay`); `src/lib/cssTokens.js` lets canvas / three.js code read the colors of `tokens.css`
  (pins, selection ring, labels). `src/data/artemis-regions.js` lists NASA's 13 regions of 2022 (names from SVS 5013; only those
  with a sourced point in `south-pole-sites.js` are analyzable) and is shown by `ArtemisRegions` in the Sites tab.

## Team and ownership

Two people work in this repo, each with their own Claude. To avoid merge conflicts, each
person stays in their own area. If you must touch the other's area or a shared file, tell them first.

- **Update 2026-11-14 (evening): Teo works on the design again, on `teo/<topic>` branches with a PR that Quentin reviews and
  merges (first one: the Artemis III identity). `DESIGN.md` is Teo's
  older brief and is outdated; `BRIEF-V2.md` is the history of the dashboard (phases A to E, done).**
- **Quentin**: data and logic. Owns `src/data/` and `src/lib/`.
- **Teo**: interface and design. Owns `src/components/` and `src/styles/`.
- **Shared** (coordinate first): `package.json`, `index.html`, this file.
- `src/App.jsx`: Teo owns the layout, Quentin owns the state and hooks.
- Colors drawn by JavaScript (3D scenes, ground painting) should read tokens through `src/lib/cssTokens.js` rather than
  repeat hex values. Exception: the layer colors in `illumination.js` / `terrain3d.js` (tests check them); keep the
  `--color-layer-*` tokens in sync with them.

## Stack

- Vite + React (JavaScript, no TypeScript), plain CSS.
- Node 24, npm. Install with `npm install`, run with `npm run dev`, check with `npm run build`, `npm run lint` and `npm test`.
- Add a dependency only when it is really needed, and say so in the PR description.

## Design rules

- All colors, spacing, fonts live as CSS variables in `src/styles/tokens.css`. Never hard-code them in components.
- One component per file in `src/components/`, class names in BEM style (`sites__item--selected`).
- The UI targets desktop browsers only (no phone layout, decided 2026-11-14).

## Data rules

- The site list in `src/data/south-pole-sites.js` is a demo set. Real values must come from NASA sources (LRO/LOLA, Moon Trek, JPL Horizons);
  always note the source next to the data.
- Do not commit large raw datasets (images, DEM). Use links or a small sample.
- Two folders at the repo root are **local only and git-ignored**: `LOLA data/` (the 115 MB LOLA map `ldem_80s_80m.img`, needed
  only to rebuild the generated data, e.g. `node scripts/build-3d-data.mjs "LOLA data/ldem_80s_80m.img"`) and
  `Moonwalk references/` (design reference pictures, some from third parties). Never `git add` them, and look at `git status`
  before committing.
- Never commit secrets: `.env` is git-ignored. Put variable names in `.env.example`.

## Git workflow

- Never commit directly to `main`. Branch names: `quentin/<topic>` or `teo/<topic>`.
- Small commits, short messages in English. Open a Pull Request to `main`; the other person
  reviews and merges.
- Before starting work: pull the latest `main`. Merge often (every 1-2 hours) so branches stay short-lived.
- Never use `git push --force`. If there is a conflict, resolve it properly or ask.

## Language

Code, comments and commit messages in English. Chat between teammates can be in French.
