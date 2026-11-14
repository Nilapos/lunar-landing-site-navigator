# Design brief (for Teo and his Claude)

Goal: turn the working but plain interface into the dashboard of the Moonwalk mockup, without breaking the data logic.
Everything works today at https://lunar-landing-site-navigator-beta.vercel.app: the job is **layout, look and feel**.

Read first: `CLAUDE.md` (how the project works, rules, ownership). Then the mockup: Notion, "TEXTE BRUT MOONWALK",
image V2 (dark dashboard, 3D south pole in the middle). It is an AI-generated mockup: follow its layout and mood, not its
numbers (some mission data in it was wrong, ours is sourced).

## Who touches what

| Area | Owner |
|---|---|
| `src/components/`, `src/styles/`, the layout in `src/App.jsx` | **Teo** |
| `src/lib/`, `src/data/`, `api/`, `scripts/`, `public/*.bin`, `public/*.json` | Quentin (data and logic) |

Quentin's Claude will not touch components or styles while the design pass is going on. If you need data or a prop that
does not exist, ask Quentin: do not change `src/lib` yourself.

## Mockup -> what exists today

| Mockup | Component today | Notes |
|---|---|---|
| Top bar: 5 scores out of 100 (Solar Exposure, Telecom, **Global Score** in the middle, Window Duration, Topography) | `ScoreBar` (inside `ScenarioPanel`) | Colors by level: green from 60, orange from 50, red below. Tooltip explains each |
| Left: Landing Window, Rover specs (solar, antenna, wheels, mass), color legend | `RequirementsPanel` (rover needs), `SiteControls` (site, landing date and time, period) | Mass is not used by any calculation yet |
| Center: "South Pole - 3D modeling", layers, zoom | `View3DPanel` -> `Terrain3D` (three.js canvas) | Layer checkboxes: Sunlight and shadows, Earth visible, Forbidden zones |
| Right: Mission History | `MissionHistory` | Real data with sources, buttons "Analyze this site" |
| Bottom: time slider (Hour / Days / Months) | slider + Play inside `Terrain3D` | Only drives the 3D layers for now (see "Ask Quentin") |
| (not in the mockup) | `SitesOverview` + `PolarMap` (2D map and ranking), `ScenarioPanel` (sky view, charts, verdict), `ComparisonTable` (A versus B) | Keep them: they are the challenge's core (Sun and Earth versus the horizon, compare sites and dates) |

## Components (props are the contract with the data code)

- `Header` (none), `ScoreBar({ evaluation })`, `Verdict({ evaluation, onShiftLanding })`, `VerdictPill({ level })` (`ok | warn | fail`).
- `RequirementsPanel({ requirements, onChange, onReset })`, `SiteControls({ title, sites, state, onChange })`.
- `ScenarioPanel({ title, state, onChange, result, evaluation })` contains `SiteControls`, `ScoreBar`, `Verdict`,
  two `MetricCard`, `SkyView`, two `ElevationChart`.
- `ComparisonTable({ rows, labelA, labelB, evalA, evalB })`.
- `SitesOverview({ items, loadedCount, start, days, selected, onSelect, compare, target, onTargetChange })` and `PolarMap({ items, selected, onSelect })`.
- `MissionHistory({ onSelectSite })`, `View3DPanel(props)` -> lazy `Terrain3D({ items, selected, onSelect, maxSlopeDeg, start, days, minSunDeg, minEarthDeg })`.
- `src/App.jsx` holds the state and the hooks (`useScenario`, `useSitesOverview`). **You may rearrange the layout there**
  (move panels, add wrappers, split into columns). Keep the hooks and the data flow as they are.

You can rename CSS classes, split or merge components, add components. Keep: the props above (or tell Quentin), the
`aria-label`s, and one `<h1>`.

## Rules

- Colors, spacing, fonts: CSS variables in `src/styles/tokens.css` only. Add tokens there, never hard-code in components.
  The map and 3D scene use JS colors for markers (`PolarMap.jsx`, `src/lib/terrainScene.js`): keep them in sync with the tokens.
- Dark theme, readable on a laptop screen and on a phone (the page must not scroll sideways).
- Contrast: text on the dark background at least 4.5:1. A color is never the only signal (verdicts also have words).
- Keyboard: markers and buttons stay focusable with a visible focus ring.
- The 3D canvas fills its container (`.view3d__canvas`, a `ResizeObserver` resizes it): you can make it much bigger.
  The mouse wheel only zooms after a click on it, on purpose (so the page can scroll).
- No new dependency without telling Quentin. `three` is the only 3D library.
- Before every push: `npm test`, `npm run lint`, `npm run build` must pass.

## Suggested order (one small PR each)

1. **Dashboard layout** in `App.jsx` and `global.css`: top score bar, left column (requirements), big center (3D), right column
   (mission history), bottom time slider. The 2D map, ranking, comparison and scenario details go below or in tabs.
2. **Look and feel**: typography, colors, cards, spacing, buttons, inputs (`tokens.css`, `global.css`).
3. **3D controls**: replace the checkboxes by the layer menus of the mockup (Layer 1 / Layer 2 / Topography), legend, time slider styling.
4. **Responsive and accessibility pass**.
5. **Pitch polish**: empty and loading states, short onboarding text, a clean first screen for the demo.

## Ask Quentin (data and logic) for

- The score bar to follow the time slider (today scores are for the whole period after landing, the slider only moves the 3D layers).
- Any number or text you need that is not shown yet.
- A default scenario that makes a good demo (a site and date where delaying the landing changes everything).

## Run it

```bash
npm install
npm run dev      # local site, including /api/horizons and /api/sky (needs internet for NASA JPL Horizons)
npm test
npm run lint
npm run build
```

## Git

Work on a branch named `teo/<topic>`, push it, open a Pull Request to `main`. Small commits, English messages. Pull `main`
before you start. No force push. Vercel builds a preview for each branch and for each Pull Request (public, no Vercel
login needed): its link is in the Vercel bot comment on the PR. `npm run dev` is still the fastest way to iterate.
