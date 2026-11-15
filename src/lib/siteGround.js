// The look of the ground in the "On site" view (three.js): lunar regolith lit by the real Sun, on the relief of siteRelief.js.
//
// What is data and what is not:
//   - the relief, the skyline and where the sunlight falls come from the LOLA grids (siteRelief.js): one value per vertex says how
//     high the Sun's center is above the terrain horizon there, and the shader turns it into the visible share of the Sun's disc
//     (a soft edge, 0.53 degrees wide, as in energy.js);
//   - under the resolution of the data (125 m at best) the ground is drawn: one small picture of regolith made by code (craters
//     with rims, bumps, pebbles: makeRegolithData), repeated at four scales from 1 m to 400 m. It gives the grain, the small
//     slopes that catch the light, and the long shadows: for each pixel the shader walks from the ground toward the Sun across
//     that small relief (9 steps, up to about 110 m) and darkens the pixel when a bump stands in the way.
// The light follows the Lommel-Seeliger law mixed with Lambert's (the Moon's dust sends light back toward the Sun and stays bright
// at grazing angles), with a small surge when looking away from the Sun. No atmosphere: shadows and the night only get the
// earthshine, from where the Earth is, when it is above the horizon of the site.
//
// Cost: one draw call, about 66 000 triangles, at most 34 texture reads per pixel near the observer and 4 beyond 1.5 km.
import * as THREE from 'three'

const SIZE = 512

// Small random generator with a seed, so the ground is the same at every visit.
function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The picture of regolith, `size` x `size`, that repeats without a seam. Returns { data (RGBA bytes), heightRange, slopeScale,
 * meanHeight (0..1) }:
 *   R: height (0..1 over `heightRange`, in units of the picture's side);  G, B: its slopes along x and y (0.5 = flat; slope =
 *   (value - 0.5) / slopeScale, height units per texel);  A: brightness of the dust (0.5 = average).
 */
export function makeRegolithData(size = SIZE, seed = 20261115) {
  const random = mulberry32(seed)
  const height = new Float32Array(size * size)
  const tone = new Float32Array(size * size)

  // Rolling ground: value noise on lattices that wrap around, each octave twice as fine and about half as high.
  const addNoise = (target, period, amplitude) => {
    const lattice = new Float32Array(period * period)
    for (let i = 0; i < lattice.length; i++) lattice[i] = random() - 0.5
    const cell = size / period
    // The columns of the lattice and the blend between them are the same on every row: worked out once.
    const left = new Int32Array(size)
    const right = new Int32Array(size)
    const blend = new Float32Array(size)
    for (let x = 0; x < size; x++) {
      const gx = x / cell
      const x0 = Math.floor(gx)
      const fx = gx - x0
      left[x] = x0 % period
      right[x] = (x0 + 1) % period
      blend[x] = fx * fx * (3 - 2 * fx)
    }
    for (let y = 0; y < size; y++) {
      const top = left[y] * period
      const bottom = right[y] * period
      const sy = blend[y]
      const out = y * size
      for (let x = 0; x < size; x++) {
        const sx = blend[x]
        const upper = lattice[top + left[x]] * (1 - sx) + lattice[top + right[x]] * sx
        const lower = lattice[bottom + left[x]] * (1 - sx) + lattice[bottom + right[x]] * sx
        target[out + x] += amplitude * (upper * (1 - sy) + lower * sy)
      }
    }
  }
  // Gentle: about 3 degrees of slope in all. The Sun is a degree or two above the horizon, so steeper dust would be all shadow.
  for (const [period, amplitude] of [[4, 2.6], [8, 1.5], [16, 0.8], [32, 0.4], [64, 0.2], [128, 0.1]]) addNoise(height, period, amplitude)
  for (const [period, amplitude] of [[4, 0.1], [16, 0.07], [64, 0.05], [256, 0.05]]) addNoise(tone, period, amplitude)

  // Stamps a round shape (wrapping around the edges): `shape(d)` is the height added at d radii from the center.
  const stamp = (cx, cy, radius, reach, shape, toneShape) => {
    const span = Math.ceil(radius * reach)
    const x0 = Math.round(cx) + size
    const y0 = Math.round(cy) + size
    const limit = reach * reach * radius * radius
    for (let dy = -span; dy <= span; dy++) {
      const row = ((y0 + dy) % size) * size
      for (let dx = -span; dx <= span; dx++) {
        const d2 = dx * dx + dy * dy
        if (d2 > limit) continue
        const d = Math.sqrt(d2) / radius
        const i = row + ((x0 + dx) % size)
        height[i] += shape(d)
        if (toneShape) tone[i] += toneShape(d)
      }
    }
  }
  // Craters: many small, few large (the number above a radius falls as its square), a bowl with a raised rim. Old ones are shallow
  // and soft, a few fresh ones are deep with a brighter rim.
  for (let n = 0; n < 170; n++) {
    const radius = 2.5 / Math.sqrt(1 - random() * 0.9969) // 2.5 to 45 texels
    const fresh = random() < 0.25
    const depth = radius * (fresh ? 0.34 : 0.1 + random() * 0.12)
    const rim = depth * (fresh ? 0.3 : 0.16)
    const rimWidth = fresh ? 0.2 : 0.34
    stamp(
      random() * size,
      random() * size,
      radius,
      1.9,
      (d) => (d < 1 ? depth * (d * d - 1) : 0) + rim * Math.exp(-(((d - 1) / rimWidth) ** 2)),
      fresh ? (d) => 0.07 * Math.exp(-(((d - 1.05) / 0.4) ** 2)) : null,
    )
  }
  // Pebbles and small blocks: rounded bumps, a little darker than the dust.
  for (let n = 0; n < 700; n++) {
    const radius = 0.9 + random() * random() * 3.2
    const top = radius * (0.5 + random() * 0.7)
    stamp(random() * size, random() * size, radius, 1, (d) => top * Math.sqrt(Math.max(0, 1 - d * d)), (d) => -0.05 * (1 - d))
  }

  let low = Infinity
  let high = -Infinity
  for (let i = 0; i < height.length; i++) {
    if (height[i] < low) low = height[i]
    if (height[i] > high) high = height[i]
  }
  const range = high - low
  // Slopes, in normalized height per texel; the scale keeps almost all of them inside a byte.
  const slopeX = new Float32Array(size * size)
  const slopeY = new Float32Array(size * size)
  let steepest = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      slopeX[i] = (height[y * size + ((x + 1) % size)] - height[y * size + ((x + size - 1) % size)]) / (2 * range)
      slopeY[i] = (height[((y + 1) % size) * size + x] - height[((y + size - 1) % size) * size + x]) / (2 * range)
      steepest = Math.max(steepest, Math.abs(slopeX[i]), Math.abs(slopeY[i]))
    }
  }
  const slopeScale = 0.5 / (steepest * 0.6) // the steepest 40% of the range is clipped: pebble edges
  const data = new Uint8Array(size * size * 4)
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)))
  let sum = 0
  for (let i = 0; i < size * size; i++) {
    sum += (height[i] - low) / range
    data[i * 4] = byte((height[i] - low) / range)
    data[i * 4 + 1] = byte(0.5 + slopeX[i] * slopeScale)
    data[i * 4 + 2] = byte(0.5 + slopeY[i] * slopeScale)
    data[i * 4 + 3] = byte(0.5 + tone[i])
  }
  return { data, size, heightRange: range / size, slopeScale, meanHeight: sum / (size * size) }
}

const VERTEX = `
attribute vec3 aLocal;   // east, north, up (m) from the observer's eyes
attribute vec3 aNormal;  // normal of the relief, same axes
attribute float aSun;    // height of the Sun's center above the terrain horizon at this vertex (deg)
varying vec3 vLocal;
varying vec3 vNormal;
varying float vSun;
void main() {
  vLocal = aLocal;
  vNormal = aNormal;
  vSun = aSun;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAGMENT = `
precision highp float;
uniform sampler2D uRegolith;
uniform vec3 uSun;        // unit vector toward the Sun (east, north, up)
uniform float uEarth;     // 1 when the Earth is above the horizon of the site: earthshine in the shadows
uniform vec3 uEarthDir;   // unit vector toward the Earth (east, north, up)
uniform float uLift;      // shadow lift of the view settings (0 to 1)
uniform float uRange;     // height range of the regolith picture, in units of its side
uniform float uSlope;     // slope scale of the picture (see makeRegolithData)
uniform float uMean;      // mean height of the picture (0 to 1)
uniform float uDetail;    // 1 = shadows of the small relief, 0 = none
varying vec3 vLocal;
varying vec3 vNormal;
varying float vSun;

const float SIZE = ${SIZE}.0;
const int STEPS = 9;            // steps of the walk toward the Sun
const float SUN_RADIUS = 0.265; // deg
// The picture is laid four times: side of one repeat (m), each turned so the repeats do not line up.
const float L0 = 1.1;
const float L1 = 6.3;
const float L2 = 47.0;
const float L3 = 410.0;
const mat2 R0 = mat2(0.819, 0.574, -0.574, 0.819);
const mat2 R1 = mat2(0.940, -0.342, 0.342, 0.940);
const mat2 R2 = mat2(0.500, 0.866, -0.866, 0.500);
const mat2 R3 = mat2(0.985, 0.174, -0.174, 0.985);
// Relief of each scale: its height range is uRange times its side, times this factor (the large scale is kept gentle: the real
// relief is in the mesh).
const float K1 = 1.0;
const float K2 = 0.85;
const float K3 = 0.22;

float lodOf(float footprint, float side) { return max(0.0, log2(footprint * SIZE / side)); }

// Height (m) of the small relief at a point of the ground (m), for a pixel that covers 'footprint' m. Seen from more than a few
// meters the finest scale is a blur: its mean height is used instead of a texture read.
float reliefAt(vec2 p, float footprint) {
  float h = K2 * L2 * textureLod(uRegolith, R2 * p / L2, lodOf(footprint, L2)).r;
  h += K3 * L3 * textureLod(uRegolith, R3 * p / L3, lodOf(footprint, L3)).r;
  if (footprint < 0.2) h += K1 * L1 * textureLod(uRegolith, R1 * p / L1, lodOf(footprint, L1)).r;
  else h += K1 * L1 * uMean;
  return h * uRange;
}

// Brightness of the dust lit from direction l and seen from v (Lommel-Seeliger mixed with Lambert). The power stands for the
// roughness smaller than a pixel: under a grazing light, flat dust is brighter than a smooth plane would be.
float dustLight(vec3 normal, vec3 l, vec3 v) {
  float mu0 = max(dot(normal, l), 0.0);
  float mu = max(dot(normal, v), 0.0);
  float seeliger = 2.0 * mu0 / (mu0 + mu + 0.04);
  return 1.55 * pow(mix(mu0, seeliger, 0.62), 0.6);
}

// Visible share of the Sun's disc when its center is 'margin' degrees above a straight horizon (area of a circular segment).
float discShare(float margin) {
  float x = clamp(margin / SUN_RADIUS, -1.0, 1.0);
  return 0.5 + (x * sqrt(1.0 - x * x) + asin(x)) / 3.14159265;
}

void main() {
  vec2 p = vLocal.xy;
  float dist = length(vLocal);
  vec3 view = -vLocal / dist;
  vec3 n = normalize(vNormal);
  float footprint = max(length(dFdx(p)), length(dFdy(p)));

  // Dust: brightness and small slopes from the four scales (the finer ones fade by themselves with the distance: mipmaps).
  vec4 t0 = texture2D(uRegolith, R0 * p / L0);
  vec4 t1 = texture2D(uRegolith, R1 * p / L1);
  vec4 t2 = texture2D(uRegolith, R2 * p / L2);
  vec4 t3 = texture2D(uRegolith, R3 * p / L3);
  float k = uRange * SIZE / uSlope; // slope of one scale = (value - 0.5) * k * its factor
  vec2 slope = (t0.gb - 0.5) * R0 * (0.55 * k) + (t1.gb - 0.5) * R1 * (K1 * k) + (t2.gb - 0.5) * R2 * (K2 * k) + (t3.gb - 0.5) * R3 * (K3 * k);
  vec3 bumped = normalize(n - vec3(slope, 0.0) * n.z);
  float tone = 1.0 + 1.1 * ((t0.a - 0.5) * 0.5 + (t1.a - 0.5) * 0.7 + (t2.a - 0.5) + (t3.a - 0.5) * 0.8);

  // Sunlight: the share of the Sun's disc above the terrain (data), then the shadows of the small relief.
  float sunShare = discShare(vSun);
  float sunFlat = length(uSun.xy);
  float shade = 1.0;
  if (uDetail > 0.5 && sunShare > 0.0 && dist < 1500.0 && sunFlat > 0.001) {
    vec2 toward = uSun.xy / sunFlat;
    // How fast a ray to the Sun rises above the ground it flies over: the Sun's slope minus the slope of the relief that way.
    float rise = uSun.z / sunFlat + dot(n.xy, toward) / max(n.z, 0.05);
    float start = reliefAt(p, footprint);
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float t = max(0.05, footprint) * (1.0 + jitter);
    float reach = mix(110.0, 30.0, smoothstep(300.0, 1500.0, dist));
    float grow = pow(reach / t, 1.0 / float(STEPS));
    for (int i = 0; i < STEPS; i++) {
      float ray = start + t * rise;
      float ground = reliefAt(p + toward * t, max(footprint, t * 0.04));
      // Soft edge: the Sun is a disc, so a shadow blurs with the distance to what casts it.
      shade = min(shade, clamp(0.5 + (ray - ground) / (t * 0.03 + 0.01), 0.0, 1.0));
      t *= grow;
    }
    shade = mix(shade, 1.0, smoothstep(700.0, 1500.0, dist));
  }
  float light = dustLight(bumped, uSun, view);
  // The surge of brightness when looking straight away from the Sun (around the observer's own shadow).
  light *= 1.0 + 0.45 * exp(-acos(clamp(dot(view, uSun), -1.0, 1.0)) / 0.14);
  // A slope of the relief that turns its back to the Sun is dark whatever the small bumps on it.
  light *= smoothstep(-0.02, 0.05, dot(n, uSun));

  vec3 dust = vec3(0.56, 0.545, 0.52) * tone;
  vec3 sunlight = vec3(1.0, 0.985, 0.95) * (light * sunShare * shade);
  // Shadows and night: earthshine when the Earth is above the horizon of the site (bluish, from where the Earth is, so the craters
  // keep their shape; no small shadows for it), and a floor so the ground stays readable (shadow lift).
  float earthLight = uEarth * dustLight(bumped, uEarthDir, view) * smoothstep(-0.02, 0.05, dot(n, uEarthDir));
  vec3 ambient = vec3(0.55, 0.68, 1.0) * (0.07 * earthLight) + vec3(0.006 + 0.03 * uLift) * (0.3 + 0.7 * pow(bumped.z, 8.0));
  vec3 color = dust * (sunlight + ambient);
  color = 1.0 - exp(-color * 1.25);                  // exposure: bright slopes roll off instead of clipping
  gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
}`

/**
 * Creates the ground of the site view. `anisotropy`: the renderer's maximum.
 * Returns { mesh (THREE.Mesh, add it where the observer's eyes are), setRelief(relief), setSunMargins(values), setSun(local unit
 * vector), setEarthshine(on, local unit vector), setLift(value), setDetail(on), dispose() }.
 */
export function createSiteGround(anisotropy) {
  const regolith = makeRegolithData()
  const texture = new THREE.DataTexture(regolith.data, regolith.size, regolith.size, THREE.RGBAFormat)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = Math.min(anisotropy, 8) // the ground is seen at a grazing angle; beyond 8 the gain does not show
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    // Triangles come far to near (siteRelief.js): each one is drawn over what is behind it, and still writes its depth so the
    // Sun, the Earth and the stars are hidden behind the ground.
    depthFunc: THREE.AlwaysDepth,
    uniforms: {
      uRegolith: { value: texture },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uEarth: { value: 0 },
      uEarthDir: { value: new THREE.Vector3(0, 1, 0) },
      uLift: { value: 0 },
      uRange: { value: regolith.heightRange },
      uSlope: { value: regolith.slopeScale },
      uMean: { value: regolith.meanHeight },
      uDetail: { value: 1 },
    },
  })
  const geometry = new THREE.BufferGeometry()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = -5
  let sunAttribute = null
  const u = material.uniforms
  return {
    mesh,
    /** The relief to draw (siteRelief.js buildSiteRelief). */
    setRelief(relief) {
      geometry.setAttribute('position', new THREE.BufferAttribute(relief.positions, 3))
      geometry.setAttribute('aLocal', new THREE.BufferAttribute(relief.local, 3))
      geometry.setAttribute('aNormal', new THREE.BufferAttribute(relief.normals, 3))
      sunAttribute = new THREE.BufferAttribute(new Float32Array(relief.count), 1)
      sunAttribute.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute('aSun', sunAttribute)
      geometry.setIndex(new THREE.BufferAttribute(relief.indices, 1))
    },
    /** The array to fill with reliefSunMargins; call sunChanged() after. */
    get sunMargins() {
      return sunAttribute?.array ?? null
    },
    sunChanged() {
      if (sunAttribute) sunAttribute.needsUpdate = true
    },
    /** Direction of the Sun in the observer's axes (east, north, up). */
    setSun(east, north, up) {
      u.uSun.value.set(east, north, up)
    },
    /** Earthshine: whether the Earth is above the horizon of the site, and its direction in the observer's axes. */
    setEarthshine(on, east = 0, north = 1, up = 0) {
      u.uEarth.value = on ? 1 : 0
      u.uEarthDir.value.set(east, north, up)
    },
    setLift(value) {
      u.uLift.value = value
    },
    setDetail(on) {
      u.uDetail.value = on ? 1 : 0
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      texture.dispose()
    },
  }
}
