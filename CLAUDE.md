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
- Sites live in `src/data/south-pole-sites.js`.
- A **scenario** = a site + a landing date + a period. `src/lib/scenario.js` turns a scenario's series into
  Sun / Earth / "both at once" windows and metrics, and compares two scenarios (`compareScenarios`).
  `src/lib/useScenario.js` (hook, with `useEphemeris.js`) loads and analyzes one scenario.
- UI: `App.jsx` (compare toggle) -> `ScenarioPanel` (controls, Sun and Earth cards, `SkyView`, `ElevationChart`)
  x1 or x2, plus `ComparisonTable` (A vs B, better value highlighted). Functional first version, not styled
  for design yet: Teo's job.

## Team and ownership

Two people work in this repo, each with their own Claude. To avoid merge conflicts, each
person stays in their own area. If you must touch the other's area or a shared file, tell them first.

- **Quentin**: data and logic. Owns `src/data/` and `src/lib/`.
- **Teo**: interface and design. Owns `src/components/` and `src/styles/`.
- **Shared** (coordinate first): `src/App.jsx`, `package.json`, `index.html`, this file.

## Stack

- Vite + React (JavaScript, no TypeScript), plain CSS.
- Node 24, npm. Install with `npm install`, run with `npm run dev`, check with `npm run build`, `npm run lint` and `npm test`.
- Add a dependency only when it is really needed, and say so in the PR description.

## Design rules

- All colors, spacing, fonts live as CSS variables in `src/styles/tokens.css`. Never hard-code them in components.
- One component per file in `src/components/`, class names in BEM style (`sites__item--selected`).
- The UI must work on a phone-width screen.

## Data rules

- The site list in `src/data/south-pole-sites.js` is a demo set. Real values must come from NASA sources (LRO/LOLA, Moon Trek, JPL Horizons);
  always note the source next to the data.
- Do not commit large raw datasets (images, DEM). Use links or a small sample.
- Never commit secrets: `.env` is git-ignored. Put variable names in `.env.example`.

## Git workflow

- Never commit directly to `main`. Branch names: `quentin/<topic>` or `teo/<topic>`.
- Small commits, short messages in English. Open a Pull Request to `main`; the other person
  reviews and merges.
- Before starting work: pull the latest `main`. Merge often (every 1-2 hours) so branches stay short-lived.
- Never use `git push --force`. If there is a conflict, resolve it properly or ask.

## Language

Code, comments and commit messages in English. Chat between teammates can be in French.
