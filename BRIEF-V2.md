# Brief V2: the Moonwalk dashboard with a "Polar sky" view

Status: written on 2026-11-14 to start a fresh session. Read `CLAUDE.md` first (how the project works, rules, data pipeline),
then this file. `DESIGN.md` is the older brief for Teo, who is not working on the repo for now: this file supersedes it.
Quentin and Claude do everything themselves, directly on `main`.

## 1. Where we are

Everything below works and is deployed (https://lunar-landing-site-navigator-beta.vercel.app, redeploys on each push to `main`):
sites and mission history with sources, JPL Horizons engine (`/api/horizons`, `/api/sky`), terrain horizon and slopes from the
LOLA map, verdicts and /100 scores from rover requirements, side-by-side comparison, 2D map and ranking, 3D terrain view with
sunlight / shadows / Earth visibility / forbidden-zone layers and a time slider. 70 unit tests, lint and build pass.

The page is currently one long vertical stack of panels. The goal of V2 is to make it look and behave like the team's mockup,
and to add the view that makes people **see why** a site has sunlight or a direct link to Earth.

## 2. Art direction (the ONLY design references: the 4 images in `Moonwalk references/` at the repo root, see its LISEZ-MOI.txt)

- `1-maquette-v2-direction-artistique.webp`: the target look. Dark dashboard: top bar with 5 scores (Solar Exposure, Telecom,
  **Global Score** in the middle, Window Duration, Topography) and layer menus; left panels (Landing window, Rover specs, color
  legend); big center view ("South pole 3D modeling": curved polar region, color layers, red forbidden zones, site pins);
  right panel Mission History; bottom timeline with Hour / Days / Months. Follow the layout and mood, not its numbers.
- `2-vue-terrain-actuelle-relief-x1.webp`: our current 3D terrain view. It becomes the "Terrain" tab (relief x1, near top-down).
- `3-...soleil-et-terre-a-l-horizon.png` and `4-...lever-de-terre.png`: look references for the "Polar sky" tab: Sun glare and halo,
  Earth as a tiny dot or a lit disc, black sky, curved textured horizon.

## 3. Target navigation (built in phase B, after the Polar sky view of phase A)

A **side rail of collapsible panels ("volets")** switches between tabs; the shell also holds the top score bar, the shared
timeline and the side panels from the mockup. Each tab is a component with its own props, so they stay independent.

| Tab | Content |
|---|---|
| **Terrain** | The current `Terrain3D` with light relief (x1 to x2 by default), near top-down camera, layers on by default: Sunlight and shadows, Earth visible (direct link), Forbidden zones. Site pins, shared timeline, Play |
| **Polar sky** (new, section 4) | Curved south polar cap with the Sun and the Earth moving in the sky with the timeline |
| **Compare A/B** | Existing `ComparisonTable` and the two scenario panels |
| **Why** (sub-tabs) | Sky chart, cause strip, ray diagram: specified in section 3b, all computed from the real data |
| Side panels | Sites overview (2D map + ranking), Rover requirements, Mission history, Landing window |

### 3b. The "Why" charts (kept from earlier explorations, described here: there are no other design files to look for)

All three use the selected scenario's `series`, the site's terrain horizon (`src/data/horizon-profiles.json`, `horizonAt`) and
the shared timeline cursor, in the dark theme and the tokens of `src/styles/tokens.css`.

1. **Sky chart**: azimuth (0 to 360, x) against elevation (about -6 to +14 degrees, y) over the whole period. The terrain horizon is
   a filled dark silhouette; the Sun track and the Earth track are curves, thick and bright where the body is above the terrain
   (margin > 0), thin and dim elsewhere; a marker with a short trail shows the current moment. A side table "Why now": body,
   elevation, terrain horizon at that azimuth, margin, verdict (word + color), next change (`stateAt`).
2. **Cause strip**: for the Sun and for the Earth, a bar over the period colored by cause: visible (margin > 0), **hidden by terrain**
   (body above the flat horizon but under the terrain), **below the flat horizon** (night, or Earth set). A cursor marks the
   current moment, labels mark the next change. Needs a pure function in `src/lib` that classifies each sample (with tests):
   visible takes precedence, because on a summit the horizon can be below 0 degrees.
3. **Ray diagram**: a static schematic for the current moment: side view of the ground, the local horizontal, the terrain mask
   angle toward each body against the body's elevation, with check / cross marks and a four-step caption (place the site, find the
   bodies, read the terrain, compare). Angles are drawn exaggerated: say so on the figure.

## 4. The "Polar sky" tab

Goal: one look explains where sunlight periods and the direct link to Earth come from. One three.js scene, two camera presets.

- **Frame**: Moon-fixed (mean Earth / polar axis), east longitude, x toward lon 0, y toward lon 90 E, z north (same as
  `src/lib/sky.js`). Moon sphere centered at the origin, radius 1737.4 km, south pole at (0, 0, -R).
- **Surface**: the south polar cap built from the 256 x 256 grid (`public/south-pole-heights.bin`), vertices on the sphere
  (lat/lon of each cell center, height times the exaggeration), so the curvature is real. Texture: the same canvas as the Terrain
  tab (hillshade + layers). Outside the 80 S disc: a neutral gray sphere with a faint graticule, blended at the edge.
- **Sun and Earth positions**: from `/api/sky` (hook `useSky`): sub-solar and sub-Earth points and the Earth distance. Sun
  direction = `unitVector(sunLat, sunLon)`; Earth at `unitVector(earthLat, earthLon) * earthKm` in the same frame. Render them at
  their **true angular size** (Sun 0.53 deg, Earth 1.9 deg) and true direction as seen from the camera (use the camera-to-body
  vector, so parallax is right); place sprites or meshes at a convenient distance along that vector rather than at 150 million km.
  Earth lit by the Sun (phase comes for free). Sun: additive glow sprite with a small star-shaped flare (reference image 3).
  Earth: procedural texture (blue, soft white clouds, some land); a real texture only if Quentin agrees to a download.
- **Camera "orbit"** (default): oblique, above the polar cap, looking toward the horizon so the curvature and the sky show (the
  mockup look). Orbit controls, wheel zoom only after a click (so the page can scroll).
- **Camera "site"**: standing at the selected site (about 2 m above ground), looking along the azimuth of the Sun or the Earth
  (buttons). The skyline is the **real terrain horizon of that site** from `src/data/horizon-profiles.json` (360 values), drawn as
  a ring/cylinder silhouette; Sun and Earth sit above or behind it at their true elevation. Only the 6 sites have profiles.
- **Verdict overlay** in both modes: for each body, visible (green) or hidden (red) with the cause in words and the numbers,
  from the same margins as the analysis (`analyzeScenario`, `evaluateScenario`): "Sun +0.9 deg is under the 3.2 deg ridge
  (hidden). Earth -0.1 deg is above the -1.4 deg horizon (visible)". In orbit mode draw a line from the site to each body.
- **Time**: one timeline index shared by all views, Play loops. Lift the state that is now inside `Terrain3D` (samples index,
  playing flag, `useSky`) into a small hook (for example `src/lib/useTimeline.js`) used by the Terrain view and the Polar sky
  view, so both follow the same slider today and the future shell can host the slider in its bottom bar.
- **Quality**: lazy-loaded chunk, dispose everything on unmount, WebGL check with a text fallback, `aria-live` text of the
  current state, no autoplay when the user prefers reduced motion, honest caption ("Sun and Earth: true size and direction;
  surface: LOLA map; textures stylized").

## 5. Decisions already taken (Quentin can overrule)

- Procedural Earth texture first; ask before downloading any asset.
- Default camera: orbit, with a toggle to the site view.
- The timeline drives the layers and the Polar sky tab. Making the **scores** follow it ("what if we land at this moment")
  is a later phase (E), because scores are computed over the period after the landing time.
- No new dependency (three.js is enough). No post-processing library: fake the glow with sprites.

## 6. Work split by model, and phases

Each phase: build, tests for new logic, check in the browser with a few screenshots, commit, push, verify the deploy.

### Phase A: the Polar sky 3D view. Done FIRST, with the most capable model (Fable), as the ONLY task of its session

Why first and alone: it is the hard part (spherical geometry, lighting, true angular sizes, visual tuning), and the other phases
are lighter and will be done later with lighter models. Keep the session lean:

- Read `CLAUDE.md`, this file, the 4 reference images, then give a plan in at most 10 lines and **go on without waiting**, unless
  something blocks you. Do not read unrelated files; reuse what exists: `src/lib/sky.js`, `useSky`, `illumination.js`,
  `terrainScene.js` (texture painting, wheel-zoom rule, dispose pattern), `terrain3d.js`, `horizon-profiles.json`,
  `analyzeScenario` / `evaluateScenario`.
- Scope, and nothing more: sections 4 (orbit camera, then site camera) and the shared-timeline hook. Integrate it in the
  **existing page** in the simplest way: a mode switch "Terrain | Polar sky" inside `View3DPanel`, both fed by the same timeline.
  Do NOT build the shell, the side rail, the score bar, the Why charts or the scores-follow-time feature: other phases.
- Pure logic (the cap vertex generation, the camera-to-body direction and angular-size helpers, the cause text) goes in `src/lib`
  with unit tests. Keep the scene code thin.
- Work in two commits: (1) orbit camera with the cap, Sun, Earth and verdict overlay; (2) site camera with the horizon
  silhouette. Use screenshots only to validate (3 to 5 in total), compare them with images 1, 3 and 4.
- Finish with: tests, lint and build green, pushed, live site checked, and a short report to Quentin (in French) of what works,
  what is stylized, and what is left. Then STOP.

### Later phases, for lighter models (Sonnet or Opus), each self-contained

B. **Shell and navigation**: side rail of collapsible panels that switches tabs, top score bar, the mockup's left and right
   panels, the shared timeline moved into a bottom bar (Hour / Days / Months). Every existing feature stays reachable.
   Responsive, keyboard-accessible, readable contrast. Mostly layout and CSS: `src/lib` stays untouched.
C. **Terrain tab** defaults: relief x1 to x2, near top-down camera, layers on by default (reference image 2).
D. **Why sub-tabs** (section 3b) with real data. First a pure function in `src/lib` that classifies each sample as visible /
   hidden by terrain / below the flat horizon (with tests), then the sky chart, the cause strip and the ray diagram.
E. **Scores that follow the moment**, a ready demo scenario for the pitch (a site and date where a delay changes everything),
   README for the jury, submission checklist (video, screenshots, links).

## 7. Rules and gotchas (carried over)

- Never invent a coordinate or a mission fact: source it. Keep the verified geometry (sky.js is validated to 0.001 deg against
  Horizons; the horizon grids against the per-site analysis).
- Horizons rejects simultaneous requests: keep one request at a time. Never call it per pixel or per cell.
- Run `npm test`, `npm run lint`, `npm run build` before every push. Push with `git push origin main` (credentials are
  cached; `gh` is not installed). Vercel redeploys by itself; check the live site after.
- Write files without a BOM (use the Write tool; PowerShell 5.1 `Set-Content -Encoding utf8` adds one and broke a build once).
- Do not commit big or third-party files. Generated 3D data is already in `public/` (rebuild with the scripts in `scripts/`, which
  need the LOLA map at `LOLA data/ldem_80s_80m.img`, at the repo root).
- `LOLA data/` and `Moonwalk references/` live at the repo root but are **git-ignored on purpose** (115 MB file, third-party
  pictures). Never force-add them, and check `git status` before each commit.
- A page scroll over the 3D view must not zoom it (wheel zoom only after a click): keep that.
- The overview layers are 2.4 km cells: on summits and slopes near the pole they can differ from the precise per-site analysis.
  Say so in the UI wherever both appear.

## 8. Open points for Quentin

- Real Earth texture (download) or keep the procedural one?
- Default camera: orbit or site?
- Should the shell keep the 2D map + ranking as a tab or as a side panel?
