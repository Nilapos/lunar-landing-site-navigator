# Lunar Landing Site Navigator

Web app for the NASA Space Apps Challenge 2026, challenge "Lunar Landing Site Navigator":
https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

Goal: help a user explore the Moon and compare candidate landing sites (slope, lighting,
hazards...) on an interactive map, with a clear ranking.

## Team and ownership

Two people work in this repo, each with their own Claude. To avoid merge conflicts, each
person stays in their own area. If you must touch the other's area or a shared file, tell them first.

- **Quentin**: data and logic. Owns `src/data/` and `src/lib/`.
- **Teo**: interface and design. Owns `src/components/` and `src/styles/`.
- **Shared** (coordinate first): `src/App.jsx`, `package.json`, `index.html`, this file.

## Stack

- Vite + React (JavaScript, no TypeScript), plain CSS.
- Node 24, npm. Install with `npm install`, run with `npm run dev`, check with `npm run build` and `npm run lint`.
- Add a dependency only when it is really needed, and say so in the PR description.

## Design rules

- All colors, spacing, fonts live as CSS variables in `src/styles/tokens.css`. Never hard-code them in components.
- One component per file in `src/components/`, class names in BEM style (`sites__item--selected`).
- The UI must work on a phone-width screen.

## Data rules

- Data in `src/data/sites.js` is currently PLACEHOLDER. Real values must come from NASA
  sources (LRO/LOLA, Moon Trek); always note the source next to the data.
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
