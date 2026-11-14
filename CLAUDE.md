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
- 3D view (`View3DPanel` -> lazy `Terrain3D` -> `src/lib/terrainScene.js`, three.js): relief mesh from a 256x256 grid
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
- Polar sky view (phase A of `BRIEF-V2.md`, done): `View3DPanel` switches between `Terrain3D` and `PolarSky` (lazy), both fed by one
  timeline (`src/lib/useTimeline.js`) and one ground painting (`src/lib/groundTexture.js`). `src/lib/polarSky.js` (tested) holds the
  geometry and wording (cap vertices on the sphere, true direction and angular size of the bodies, cause text), `src/lib/cellProbe.js`
  (tested) the hover card of a 2.4 km cell (rules of `verdict.js` / `scores.js`), `src/lib/polarSkyScene.js` the three.js scene with
  two cameras: orbit, and standing on the site of scenario A with its real horizon profile as the skyline. Earth, Sun glare and
  ground textures are drawn by code (`src/lib/skyTextures.js`): stylized, no downloaded asset.
- Dashboard shell (BRIEF-V2 phases B to E, done): `App.jsx` composes `Shell` (top bar with `ScoreBar`, folding side columns, rail of tabs
  Polar sky / Terrain / Why / Analysis / Sites, `TimelineBar` at the bottom). Desktop browsers only, no phone layout. The "Why" tab
  (`Why`, `SkyChart`, `CauseStrip`, `RayDiagram`) uses the pure `src/lib/cause.js`. "Scores follow the timeline" uses
  `src/lib/momentScores.js` (scores measured after the moment shown). The pitch demo button and its checked numbers are in `App.jsx`.
  `README.md` is the page for the jury and `SUBMISSION.md` the checklist of what the team still has to deliver.
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
