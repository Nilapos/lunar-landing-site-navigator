// Colors of the ground layers that the interface and the drawing code must agree on (keep the --color-layer-* tokens of tokens.css in sync).
//   Feasible  = neon green (feasibility.js), the color of "go"; amber for marginal cells.
//   Optimal   = its own color, so that the two modes that replace the Sun / Earth / Slope layers can be told apart at a glance.

/** The "Optimal" layer: slope, Sun and Earth fine at once (illumination.js, and the GPU version in capMaterial.js). Keep in sync with --color-layer-optimal. */
export const OPTIMAL_RGB = [255, 43, 214]
