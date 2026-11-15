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
- `src/lib/verdict.js` + `src/lib/scores.js`: green / orange / red verdicts and scores in % of the need (Night endurance, key `solar`,
  Telecom, Window Duration, Topography, Global = average) by comparing measured values with the rover
  requirements typed in `RequirementsPanel`. One rule everywhere: ratio = offered / needed, score =
  100 x min(ratio, 2) (100 = just met, capped at 200 = `MAX_SCORE`), red below 100, orange to 120, green from 120 (ratio 1.2).
  The verdict of a site is its worst requirement, not the average. No home-made formulas.
- Slopes: `slopeStats` in `terrain.js` (LOLA **20 m** since 2026-11-15, within 100 m of the site; the horizon profiles are still from the 80 m map), recomputed alone with
  `node scripts/compute-horizons.mjs "LOLA data/ldem_80s_20m/ldem_80s_20m.img" --slopes-only`; without the flag the script also recomputes the horizons (then give it the 80 m map), precomputed with the horizons
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
  Sky / On site / Why / Analysis / Sites / Mission, with Settings and Missions as drawers opened from the top bar (`rail: false` in `DRAWERS`: the gear chip with the site and the date, and the Missions button), `TimelineBar` at the bottom). Desktop browsers only, no phone layout. The sky and site tabs share one `PolarSky` element (the scene stays alive); the camera has three modes (`orbit`, `top`, `site`) and the orbit/top move is an animated flight (`setOrbitPose` in `polarSkyScene.js`). `ScoreCard` is the one card of the view (global score, four gauges, Sun and Earth in words, details). The "Why" tab
  (`Why`, `SkyChart`, `CauseStrip`, `RayDiagram`) uses the pure `src/lib/cause.js`. "Scores follow the timeline" uses
  `src/lib/momentScores.js` (scores measured after the moment shown). The pitch demo button and its checked numbers are in `App.jsx`.
  `README.md` is the page for the jury and `SUBMISSION.md` the checklist of what the team still has to deliver.
- Fine zones (2.4 km overview, then 100-250 m cells): `scripts/build-zones.mjs <ldem_80s_*.img> [--cell 125] [--size 16]` writes, for each
  analyzable site, `public/zones/<id>.json|bin|png` (heights, slope, 72-azimuth horizon per cell, and a hillshade). `src/lib/zones.js` (tested)
  parses them and builds the patch geometry; `useZone` loads one when the camera comes within about 90 km of the selected site (`near`,
  reported by `polarSkyScene.js`); `paintZone` paints the same layers on its cells and the cap material cuts a hole in the overview
  under it (`ground.setHole`). The "Zoom to site" button flies the camera down to it. `createDemAuto` (terrain.js) reads any LDEM_80S product (80, 40 or 20 m).
  The committed zones come from the 20 m map (`LOLA data/ldem_80s_20m/`, 1.85 GB, git-ignored, from NASA PDS Geosciences: 128 x 128 cells of 125 m per 16 km zone, built 2026-11-15
  with `node scripts/build-zones.mjs "LOLA data/ldem_80s_20m/ldem_80s_20m.img" --cell 125 --size 16`, about 2 minutes). The other scripts (compute-horizons, build-3d-data, build-horizon-grid, render-map) still assume the 80 m map.
- Best landing areas (`src/lib/bestAreas.js`, tested; `BestAreas` is a menu of the top bar, so it works in every tab; the search lives in `App.jsx`, which also loads the terrain
  data and the cell frames for the sky view): `findBestAreas` takes the share of the period each 2.4 km cell is optimal (`goFractions`), then judges the best ~300 cells EXACTLY like a clicked
  place (`judgeCell`: `pointSite` + `cellSeries` (az/el of the cell from the sky samples, same shape as a Horizons series) + `evaluateFromMoment`: the four requirements, the same /100 scores), each at its own
  best landing moment (the period start or the start of one of its two longest Sun + Earth windows, on a sample). Before 2026-11-15 the list judged each cell over the whole period with three items and no
  landing window, while the card and the Analysis tab judge from a landing moment with four: the numbers differed and an area with a good score could never be feasible (the verdict is the worst requirement,
  the score an average). Ranking: verdict (feasible first), then score; an area that is never feasible stays in the list with the requirement that holds it back. Picking an area (`pickArea` in App.jsx)
  selects that place as the site (`pointSite`), puts the timeline on its landing moment and, when the sky view is open, flies the camera there (`flyTarget`); the numbered rings (`setRankMarkers`) show on the map.
  The Analysis tab then shows the same evaluation as the Sky card ("scores follow the timeline"; in Compare mode the scenarios keep their period-start evaluation). Its "Sky at" view has no slider of its
  own: it follows the timeline at the bottom (scenario B at the same offset from its own start).
- 500 m grid (level between the 2.4 km overview and the site zones): `scripts/build-fine-grid.mjs <ldem_80s_*.img> [--cell 500]` writes
  `public/grid500/index.json` and one gzip file per 16 km chunk (heights, slope, delta-coded 72-azimuth horizon) for everything south of 83 S
  (about 600 chunks, 43 MB raw, 15-18 MB compressed). `src/lib/fineGrid.js` (tested) decodes a chunk as a "zone" (zones.js), `useFineChunks`
  loads the ~80 chunks around the point the camera looks at (reported by `polarSkyScene.js` through `onView`), and `paintFine` draws each
  loaded chunk at its own resolution on a 2048 px canvas that the cap shader lays over the overview layers. Without the data files the app simply stays on the 2.4 km overview.
  Built ONCE from the 20 m map on 2026-11-15 (637 chunks, 21 MB; about 15 minutes with `node scripts/build-fine-grid.mjs "LOLA data/ldem_80s_20m/ldem_80s_20m.img" --cell 500`) and committed;
  rule: do not regenerate and commit it again without a strong reason (each committed regeneration adds a full copy to the history).
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
  `public/moon-wac-2048.jpg` (global, equirectangular, 2048 x 1024 = tile level 2, layer LRO_WAC_Mosaic_Global_303ppd_v02; it was 4096 x 2048 until 2026-11-15, lowered for smoothness) and `public/moon-wac-south-2048.jpg` (south polar,
  polar stereographic, layer LRO_WAC_Mosaic_SPole60_100m_v02). `polarSkyScene.js` draws the sphere in two meshes meeting 33 degrees from the pole
  (`southPolarUv` in polarSky.js gives the coordinates of the ring); the picture drawn by code (skyTextures.js) stays as the fallback if a file is
  missing. Credit: NASA/GSFC/Arizona State University (LRO WAC), via NASA Moon Trek.
  Rework of 2026-11-14 to get close to NASA's Artemis video: (1) the cap itself is a photograph, `public/south-pole-photo.jpg` (same polar WAC mosaic, tile level 4,
  535 m/px, cropped to the 3D map square; rebuild with `node scripts/moon-textures/serve.cjs pole.html <out.jpg>`, see the header of that file); `paintBase` draws it as the
  ground, the hillshade only as a light overlay shading, the layers are at 55% opacity over it (`groundLook`), and the last 5% of the radius fades to transparent so the cap melts
  into the Moon; (2) around the cap the global mosaic covers the whole sphere and the polar mosaic is laid over the ring with an alpha fade toward
  the 33 degree seam (`fadedPolarCanvas`), so no hard seam; (3) the Moon photos are lit by the real Sun direction (`setSample`) with little emissive light: phase and
  terminator follow the timeline, the far side is dark; (4) a `globe` camera pose (whole Moon at true size) next to orbit / top; the view opens on the globe and dives
  to the pole (effect in `PolarSky.jsx`); (5) relief default x1 (true scale).
  Performance rework (same day): the cap is a `ShaderMaterial` (`src/lib/capMaterial.js`) that combines pieces on the GPU instead of one 2048 px canvas repainted at every step of the
  timeline. Base photo and graticule: painted once. Sunlight / shadows, Earth visibility and the instant Optimal layer: computed per 2.4 km cell **in the fragment shader** from the Sun and
  Earth directions (uniforms), the analytic local frame of the cell and the terrain horizon bytes (`horizonGrid.js`) laid out as an atlas texture, same rules and colors as
  `illumination.js` (checked cell by cell against it: 50 960 cells, a handful of borderline differences from float32). The layers that do not depend on the moment (Optimal over the period,
  Feasible, forbidden zones) are small premultiplied pictures (`staticLayers`) uploaded only when their inputs change. `layerPlan` decides which is which. Chunks (`paintFine`) are still
  drawn on the CPU, at most every 66 ms. The renderer's pixel ratio is capped at 1.5, `onView` is not reported during a flight nor from far away (`FAR_KM`), pins are only rescaled when the
  distance changes, repainted textures have no mipmaps. Measured next (2026-11-15, `__polarSky.benchmark()` in the dev console renders synchronously, so it works in a hidden pane): the GPU frame costs about 4 ms,
  but the hover test on the 130 000-triangle cap mesh (three's raycaster) cost 13 ms at every pointer move: replaced by `pickCap` (polarSky.js, tested), a march through the thin shell of the
  height field (0.01 to 0.1 ms). Every step of the timeline re-renders the whole app: `evaluate` is memoized, the day marks of `TimelineBar` too, and the pins are only rebuilt when what they
  show changes (`pinsShownRef`). The global Moon picture is 2048 x 1024 (0.8 MB) instead of 4096 x 2048 (3 MB, 43 MB of GPU memory with mipmaps). If you change the sun / Earth / Optimal rules in `illumination.js`, change `capMaterial.js` too.
  Third pass (2026-11-15): the live layers are baked once per step of the timeline into a 256 x 256 render target (`BAKE_FRAGMENT`), so the cap's shader, run for every pixel of every
  frame, only reads textures. Frames are drawn **on demand** (`dirty` / `invalidate` in polarSkyScene.js: camera change, flight, any call from outside the scene, which are all wrapped at the end of
  `createPolarSkyScene`; a still scene is redrawn every 250 ms as a safety net): if you add a way to change what is drawn that does not go through the returned API, call `invalidate()`. `adaptResolution` lowers
  the pixel ratio (down to 0.75) when continuous frames come slower than about 40 per second, and raises it again slowly, never above the level that was too slow. The cards over the 3D view
  (`.skycard`, `.scorecard`, `.bestareas`) have no `backdrop-filter` any more (the browser re-blurred the area behind them every time the canvas changed) and use the opaque-enough
  `--color-surface-card`. The sky sphere is drawn after the Moon and the cap so its pixels hidden by them are rejected by the depth test. Do not put a `backdrop-filter` back on something over the canvas.
- Energy balance (2026-11-15, `src/lib/energy.js`, tested): for the selected site over the period T (= the analysis period, 30 days by default, about one lunar day-night cycle of 29.5 days;
  a 24 h window means nothing on the Moon). The Sun request of `horizons.js` now also asks Horizons for the apparent angular diameter (quantity 13) and the distance delta in au (quantity 20): the series
  carry `sunDeltaAu` and `sunAngDiamArcsec`. Chain: irradiance I = 1361 / delta^2 (IAU 2015 nominal TSI at 1 au) x `sunDiscFraction` (visible share of the Sun's disc above the terrain horizon, circular
  segment, disc radius from Horizons; I is already the power of the whole disc, so no solid angle in steradians is multiplied) x `panelCosine` (incidence: 'vertical-tracking' by default = cos(elevation), 'horizontal' =
  sin(elevation), or 'fixed' with tilt and azimuth; this choice changes the result by a factor of about 29 near the pole) -> W/m2 on the panel; x panel area, x cell efficiency, x charge efficiency -> battery;
  trapezoids over T -> Wh; `simulateBattery` (starts full, constant mean load, capacity bound) gives the lowest charge and the share of the period without power. Specs live in `power.energy` of each vehicle in
  `src/data/vehicles.js` (schema at the top: area, efficiencies, battery Wh, consumption operating / survival / hours of work per day, panel orientation); each vehicle has its own balance, and the item sums them
  (`energyItem` in verdict.js). `power.energy: null` means no energy item (both generic missions now have hypothesis specs, so the item shows on each). The item is "Energy collected / Day" (ratio = total collected per day / total needed per day of all the vehicles, same score rule as everywhere; the Mission tab shows the total needed as "Energy to collect per day"):
  it is for information only (`informative: true`): it shows as a fifth gauge and in the details, but it NEVER blocks a site (not in the verdict, not in the blockers) and it is NOT in the global score (still the average of four). The numbers of the two generic vehicles are hypotheses. Not modeled: light
  reflected by terrain, shadow of the vehicle on its panels, temperature and dust (put them in the efficiency), the horizon's variation across the Sun's disc, a load that changes between day and night.
  Limit to remember: the energy ratio is an average over T, so a long night can still empty the battery even if the ratio is high; `simulateBattery` still computes this per vehicle but the item's detail no longer shows it (kept simple on purpose).
  Maps and the Feasible layer do not use it yet (the grid samples from /api/sky have no Sun distance).
- Zoom-adaptive imagery, graticule and cursor (2026-11-15): a **window** of the map plane (`tileGrid.js` `windowFor`: the whole cap, or the cap divided by a power of two, centered on a multiple of a quarter of
  its size, follows the camera; `polarSkyScene.js` reports it with `onWindow` once the camera has kept it 250 ms and no flight runs). Two 2048 canvases are drawn for it and mapped on the cap by `capMaterial.js`
  (`uWindow`): the **detail** (`tileWindow.js`: tiles of NASA Moon Trek, fetched straight from trek.nasa.gov, CORS open, cached 480 tiles, coarse pass then the level whose pixels match the canvas, middle first) and the **grid**
  (`mapGrid.js`: latitude circles and meridians with their values, 2 degrees of latitude for the whole cap down to 0.005 degree, plus the candidate region squares, outline only when zoomed in). The fine zone has its own pair
  (`zoneMaterial.js`, window = the zone, 16 km). Moon Trek layers (all share one grid, see `tileGrid.js`; the real deepest level on the server is the listed count minus 3): imagery = `LRO_WAC_Mosaic_SPole60_100m_v02` (level 5, 267 m/px)
  then `LRO_NAC_Mosaic_SPole85.5_1mp` (level 11, 4.2 m/px, 85.5 S to the pole); **PSR** = `NAC_POLE_PSR_SOUTH_STRETCH` (LROC NAC 10 m/px mosaic of the permanently shadowed regions, level 8: opaque inside them, drawn as a violet
  footprint with an outline and the floor images faint); **Roughness** is not a Moon Trek layer any more (see the roughness bullet below). The PSR toggle is a pill in `LayerToggles.jsx`.
  The cursor (`hoverCell.js`, tested) frames the finest cell there is data for under the pointer (zone 125 m, loaded 500 m chunk, else the 2.4 km cell) and the probe card is about that cell; the frame is never smaller than 22 px on the screen.
  Needs the network: without it the app keeps the stitched photo of the cap and the grid. `__tiles` (dev) is the cap's TileWindow.
  **The Top view is a flat 2D map** (`src/lib/mapScene.js`, 2026-11-15): `PolarSky.jsx` makes `createMapScene` for `view === 'top'` and `createPolarSkyScene` (3D: Globe, Orbit, On site) otherwise, with the same interface
  for what the component drives (`ground`, `zoneGround`, `setSites`, `setZone`, `flyTo`, `zoomToSite`, `onWindow`, `locateCell`...), so every effect runs unchanged on either; the scene is made again when the view switches (`engine` is a
  dependency of the effects). The map: orthographic camera straight above (lon 0 up), the cap material on a flat square, the fine zone a flat square over it, no sphere, stars or relief mesh; zoom (wheel, double click, +/- buttons,
  "Zoom to site") and pan only, smoothed (time constant 0.1 s), inside the map; pins and the cursor keep a constant size on the screen; the graticule is drawn on a canvas over the view at screen pixels (`paintScreenGrid`: 1 px lines,
  11 px values, nothing deformed, nothing uploaded while zooming; `scene.screenGrid` tells PolarSky to leave the ground's grid texture empty). The 3D views keep the texture grid, thinner and smaller than before.
  The **relief setting** (x1 to x4, "View settings") exists in both views: in 3D it raises the relief of the mesh; on the flat map it strengthens the **relief shading** (the LOLA hillshade is now laid over the photo by the shader, `uShade`, overlay blend, 0.3 at x1 up to 1.0 at x4, and over the sharp imagery and the fine zone from x2 on: `setRelief` in capMaterial.js and zoneMaterial.js). `paintBase` draws the photo only.
- Clean surface of the 2D map (2026-11-15): the LRO NAC polar mosaic is a patchwork of swaths with different exposures (visible bands, pixelation, black patches), so the Top view's default **Surface** is
  **Relief**: the LOLA hillshade of NASA Moon Trek (one fixed Sun for the whole map: no seams, crisp shadows, the look of NASA's SVS videos). `TILE_LAYERS.shade30` (`LRO_LOLA_Shade_SPole75_30mp_v04`, 134 m/px at its deepest
  served level L6, 457 km around the pole) everywhere, `shade10` (`LRO_LOLA_Shade_SPolar875_10m`, 33 m/px at L8, 75.8 km around the pole) on top from level 7. The 5 m one (`SPole875_5mp`) shows the LOLA ground tracks as
  scan lines: not used. View settings: **Surface** Relief / Photo (WAC + NAC, as before) / Mix (photo at 40% over the relief), and **Shadow lift** (`uLift`, `lifted()` in capMaterial.js and zoneMaterial.js: gamma and a small
  floor, 30% by default, because the shadows of a hillshade are black). The 3D views always use the photo. Limit: beyond 75.8 km from the pole the relief is 134 m/px, so a very close zoom there is soft (the fine zones and the
  500 m chunks are the sharp data). **QuickMap / ShadowCam** (checked 2026-11-15): LROC's Lunaserv WMS (`https://data.im-ldi.com/shadowcam/wms`, CORS open, polar stereographic `IAU2000:30118`, bbox in meters) works for the
  WAC layer, but its `luna_shadowcam_pds` layer answers a server error ("database shadowcam does not exist") and is a set of single images, not a mosaic; the `luna_lroc_pds_rdr` layer is empty at the pole. Not used.
  **Switch to / from Top view** (2026-11-15): the 3D scene and the flat map are two scenes, so the switch used to rebuild a whole WebGL scene at once (hitch, then a pop). Now, to Top view, the 3D camera first flies to the straight-down pose
  (`POSES.top`, radius 704 so the cap is framed like the map: whole cap + 4% margin), then after `FLIGHT_MS` the map takes over (`mapReady` in PolarSky.jsx); coming back, the 3D scene opens on that pose and flies out. The scene that is replaced hands over its last
  picture (`scene.snapshot(canvas)`, rendered synchronously because the drawing buffer is cleared after display) to the `view3d__ghost` canvas, which stays over the new scene while it compiles and fills its textures, then fades out (450 ms wait, 700 ms fade).
  The **graticule** of the 2D map is a hairline in the bluish `--color-grid-map` over a dark casing (`LOOK_2D` in mapGrid.js), 10 px values.
- Roughness layer (2026-11-15, `src/lib/roughness.js` tested, `scripts/build-roughness.mjs`, `public/south-pole-roughness.bin`, 1.5 MB, built ONCE from the 20 m LOLA map in 3 s, committed: do not regenerate it and
  commit it again without a strong reason): per 500 m cell, the RMS deviation (m) of the 20 m pixels from the mean of the 5 x 5 pixels around them (100 m, the scale of a lander and a rover; the regional slope and the big craters are
  out, they are the slope layer's job). Percentiles of the region: 10th 0.42 m, median 0.71, 75th 0.96, 90th 1.31, 99th 2.53. Our own metric from NASA's LOLA map, NOT NASA's roughness product (`LRO_LOLA_ClrRoughness_SPole75S_240m`,
  served down to about 1 km per pixel only). It replaces the Diviner rock abundance layer (`Diviner_avg_RockAbundance_SP`), which has no data within about 280 km of the pole, so it drew nothing on the cap. Drawing: the file is loaded the
  first time the **Roughness** pill is switched on, smoothed lightly (`smoothRoughness`, RMS over 3 x 3 cells = 1.5 km), uploaded as one R8 texture (`setRoughness` in capMaterial.js, shared with the fine zone, `ROUGHNESS_GLSL`) and drawn
  as a faint veil (up to 60%) of one hue family, deep purple to magenta to pale pink, from 0.95 m (about the 70th percentile) to 1.85 m (99th), UNDER the Sunlight / Earth / Slope layers, nothing on smoother ground. Tried and dropped:
  the RMS about the plane of a 500 m cell (it mostly measures crater relief and varies little: median 3.2 m, 99th 12.4 m, after smoothing 4.0 and 7.9) and iso-lines (they threaded the noise of the data). Not used in any score yet; a
  rover-specific limit would need a sourced value. Keep `--color-layer-rough-*` in tokens.css in sync with `ROUGH_COLORS`.
- Data build order after changing the LOLA inputs or the grid: `build-3d-data.mjs`, then `build-horizon-grid.mjs`.
- UI scale (2026-11-15): below 1700 px of window width the whole interface is drawn at 80% (`--ui-zoom` in tokens.css, `#root { zoom }` in global.css), the look of a browser zoom of 80%: more fits, nothing overlaps. CSS zoom
  keeps `clientWidth` in layout pixels but `getBoundingClientRect` in screen pixels, so pointer code divides by `rect.width / clientWidth` (`pointer()` in mapScene.js; the 3D scene uses ratios already); heights in `vh` are divided by
  `--ui-zoom` (`.shell`, `.bestareas__body`). Checked in the browser pane: clicks on the 2D map pick the right site. Set `--ui-zoom: 1` to turn it off.
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
