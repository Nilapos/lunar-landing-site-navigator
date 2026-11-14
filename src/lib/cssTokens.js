// Reads design tokens (CSS variables of src/styles/tokens.css) for drawings made in JavaScript (canvas, three.js),
// so the 3D views use the same colors as the rest of the interface.

/** Value of one CSS variable on :root, e.g. cssToken('--color-region-edge'). Empty string outside a browser. */
export function cssToken(name) {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Colors of the graticule and of the candidate region squares painted on the ground. */
export function groundOverlayColors() {
  return {
    grid: cssToken('--color-grid'),
    regionFill: cssToken('--color-region-fill'),
    regionEdge: cssToken('--color-region-edge'),
  }
}
