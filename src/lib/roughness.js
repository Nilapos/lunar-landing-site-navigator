// Surface roughness of the south polar region: the RMS deviation (meters) of the LOLA 20 m heights from the mean of the 5 x 5 pixels
// around them (100 m), over each 500 m cell, computed once by scripts/build-roughness.mjs into public/south-pole-roughness.bin (see that file for the method and the
// format). It is our own metric from NASA's LOLA map, not NASA's roughness product (that one is only served down to about 1 km per pixel).
// Here: parsing, value lookup, and how the layer is drawn (the GLSL shared by the cap and the fine zone).

/** Parses the file: { n, cellM, countsPerM, px, data } (data: n x n Uint8 values, rows from the top, x east / y toward lon 0). */
export function parseRoughness(buffer) {
  const [n, cellM, countsPerM, px] = new Uint16Array(buffer, 0, 4)
  if (!n || buffer.byteLength !== 8 + n * n) throw new RangeError('Not a roughness file')
  return { n, cellM, countsPerM, px, data: new Uint8Array(buffer, 8, n * n) }
}

let loading = null
/** Loads the roughness file once (a promise shared by every caller). */
export function loadRoughness() {
  loading ??= fetch('/south-pole-roughness.bin')
    .then((r) => {
      if (!r.ok) throw new Error('roughness file missing')
      return r.arrayBuffer()
    })
    .then((buffer) => smoothRoughness(parseRoughness(buffer)))
  loading.catch(() => {
    loading = null // try again next time
  })
  return loading
}

/**
 * The grid smoothed for the map: each value becomes the root mean square of the values around it (a square of 2 x radius + 1 cells,
 * 1.5 km for the default radius of 1), cells without data left out. The 500 m values vary a lot from one cell to the next (a boulder
 * field next to a smooth patch); a light average keeps it from turning into speckle. Returns a new { ...r, data }.
 */
export function smoothRoughness(r, radius = 1) {
  const { n, data } = r
  const squares = new Float32Array(n * n)
  const valid = new Float32Array(n * n)
  for (let k = 0; k < n * n; k++) {
    squares[k] = data[k] * data[k]
    valid[k] = data[k] > 0 ? 1 : 0
  }
  const sumBox = (src) => {
    const rows = new Float32Array(n * n)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let s = 0
        for (let d = Math.max(-radius, -i); d <= Math.min(radius, n - 1 - i); d++) s += src[j * n + i + d]
        rows[j * n + i] = s
      }
    }
    const out = new Float32Array(n * n)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let s = 0
        for (let d = Math.max(-radius, -j); d <= Math.min(radius, n - 1 - j); d++) s += rows[(j + d) * n + i]
        out[j * n + i] = s
      }
    }
    return out
  }
  const sumSquares = sumBox(squares)
  const count = sumBox(valid)
  const smooth = new Uint8Array(n * n)
  for (let k = 0; k < n * n; k++) smooth[k] = data[k] > 0 ? Math.min(255, Math.round(Math.sqrt(sumSquares[k] / count[k]))) : 0
  return { ...r, data: smooth }
}

/** RMS deviation (m) of the cell under a map plane point (km from the pole, x east, y toward lon 0), or null outside the grid. */
export function roughnessAt(r, xKm, yKm) {
  const span = (r.n * r.cellM) / 1000
  const i = Math.floor((xKm / span + 0.5) * r.n)
  const j = Math.floor((0.5 - yKm / span) * r.n)
  if (i < 0 || j < 0 || i >= r.n || j >= r.n) return null
  return r.data[j * r.n + i] / r.countsPerM
}

// How the layer looks. The Sunlight, Earth and Slope layers are translucent color fills, so a strong fourth fill would turn into a muddle.
// The roughness is a faint veil of one hue family (deep purple, magenta, pale pink) under the other layers, that only starts above
// ROUGH_FILL_FROM_M: after smoothing, the median of the region is 0.79 m, the 75th percentile 1.0 m, the 90th 1.25 m, the 99th 1.85 m
// (measured 2026-11-15), so the smooth plains stay clear and the veil marks the broken ground. (Two other looks were tried and dropped:
// the RMS about the plane of a 500 m cell, which mostly measures the relief of craters and varies little, and iso-lines, which threaded
// the noise of the data instead of outlining regions.)
// Keep --color-layer-rough-* in tokens.css in sync with ROUGH_COLORS.
export const ROUGH_FILL_FROM_M = 0.95 // about the 70th percentile
export const ROUGH_FILL_TO_M = 1.85 // the ramp ends here (about the 99th percentile of the region)
export const ROUGH_COLORS = { low: [0.38, 0.19, 0.66], mid: [0.89, 0.25, 0.75], high: [1, 0.84, 0.94] }
export const ROUGH_FILL_MAX_ALPHA = 0.6

/** GLSL for the cap and the fine zone: uniforms uRough (R = RMS deviation / uRoughScale), uRoughLow / Mid / High, and roughFill. */
export const ROUGHNESS_GLSL = `
uniform sampler2D uRough;      // R: RMS deviation of the 500 m cells, smoothed, uRoughScale meters = 1 (roughness.js)
uniform float uRoughOn;
uniform float uRoughScale;
uniform vec3 uRoughLow;
uniform vec3 uRoughMid;
uniform vec3 uRoughHigh;
float roughM(vec2 uv) { return texture2D(uRough, uv).r * uRoughScale; }
vec3 roughRamp(float t) { return t < 0.6 ? mix(uRoughLow, uRoughMid, t / 0.6) : mix(uRoughMid, uRoughHigh, (t - 0.6) / 0.4); }
// The veil: premultiplied, nothing on smooth ground.
vec4 roughFill(vec2 uv) {
  float t = clamp((roughM(uv) - ${ROUGH_FILL_FROM_M.toFixed(2)}) / ${(ROUGH_FILL_TO_M - ROUGH_FILL_FROM_M).toFixed(2)}, 0.0, 1.0);
  float a = ${ROUGH_FILL_MAX_ALPHA.toFixed(2)} * t * min(1.0, t / 0.12);
  return vec4(roughRamp(t) * a, a);
}
`
