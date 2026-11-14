// The material of the south polar cap. The ground is made of separate pieces combined by the GPU, so that a step of the timeline
// costs a few uniforms instead of repainting and re-uploading a 2048 x 2048 picture:
//   base     (2048 canvas, painted once): the LRO photograph + light relief shading;
//   live     (computed in the fragment shader, per 2.4 km cell): sunlight and shadows, Earth visibility and the instant "Optimal"
//            layer, from the Sun and Earth directions (uniforms), the local frame of the cell (analytic) and the terrain horizon of
//            the cell (an atlas texture of the same bytes as horizonGrid.js). Same rules and colors as illumination.js;
//   static   (grid x grid data textures, premultiplied, uploaded only when their inputs change): the layers that do not depend on
//            the moment: "Optimal over the period", "Feasible" and the forbidden zones (slope);
//   fine     (2048 canvas, only drawn while 500 m chunks are loaded): the same layers at the chunks' own resolution. Inside a chunk
//            its alpha is 0.5 + layer alpha / 2, and 0 elsewhere, so the alpha also tells where the chunk replaces the overview layer;
//   overlay  (2048 canvas, painted once): the graticule and the candidate region squares.
// The rim of the cap fades to transparent (a function of the distance to the pole), and a "hole" can be cut where a fine zone
// takes over. All colors are the raw sRGB values of the pictures (no color-space conversion on either side).
import * as THREE from 'three'
import { TEXTURE_SIZE } from './groundTexture.js'
import { AZIMUTHS, HORIZON_MIN_DEG, HORIZON_STEP_DEG } from './horizonGrid.js'
import { MAP_RADIUS_KM } from './polarMap.js'
import { MOON_RADIUS_M } from './terrain.js'

const ATLAS_COLUMNS = 9 // the 72 azimuths of the horizon as 9 x 8 tiles of grid x grid texels

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const fragment = (grid) => `
precision highp float;
precision highp int;
precision highp sampler2D;
#define GRID ${grid}
#define AZIMUTHS ${AZIMUTHS}
#define COLUMNS ${ATLAS_COLUMNS}
const float PI = 3.14159265358979;
uniform sampler2D uBase;
uniform sampler2D uOverlay;
uniform sampler2D uFine;
uniform sampler2D uHorizon;   // R8, bytes of horizonGrid.js laid out as an atlas
uniform sampler2D uSlopeDeg;  // R8, slope of the cells in degrees
uniform sampler2D uMain;      // premultiplied RGBA: Optimal over the period, or Feasible
uniform sampler2D uSlopeLayer;// premultiplied RGBA: forbidden zones
uniform float uWidthKm;
uniform float uMoonKm;
uniform vec3 uSunDir;
uniform vec3 uEarthUnit;
uniform float uEarthKm;
uniform float uMinSun;
uniform float uMinEarth;
uniform float uMaxSlope;
uniform float uSunOn;
uniform float uEarthOn;
uniform float uGoOn;
uniform float uMainOn;
uniform float uSlopeOn;
uniform float uLayerAlpha;
uniform float uFineOn;
uniform float uEdgeFade;
uniform vec4 uHole; // x, y, side (fractions of the map, y from the top), on
varying vec2 vUv;

float horizonByte(ivec2 cell, int k) {
  ivec2 tile = ivec2(k - (k / COLUMNS) * COLUMNS, k / COLUMNS);
  return floor(texelFetch(uHorizon, tile * GRID + cell, 0).r * 255.0 + 0.5);
}
float decode(float b) { return (b - 1.0) * ${HORIZON_STEP_DEG.toFixed(2)} + (${HORIZON_MIN_DEG.toFixed(1)}); }
// Horizon elevation (deg) of a cell at an azimuth (deg), interpolated between the stored azimuths.
float horizonAt(ivec2 cell, float azDeg) {
  float pos = azDeg / (360.0 / float(AZIMUTHS));
  float i0 = floor(pos);
  float f = pos - i0;
  int k0 = int(i0);
  k0 = k0 - (k0 / AZIMUTHS) * AZIMUTHS;
  int k1 = k0 + 1;
  if (k1 >= AZIMUTHS) k1 = 0;
  return mix(decode(horizonByte(cell, k0)), decode(horizonByte(cell, k1)), f);
}
// Margin (deg) of a direction above the terrain horizon of the cell, from its local frame.
float margin(ivec2 cell, vec3 up, vec3 east, vec3 north, vec3 dir) {
  float el = degrees(asin(clamp(dot(dir, up), -1.0, 1.0)));
  float az = degrees(atan(dot(dir, east), dot(dir, north)));
  if (az < 0.0) az += 360.0;
  return el - horizonAt(cell, az);
}
vec4 over(vec4 top, vec4 bottom) { return top + bottom * (1.0 - top.a); } // premultiplied

void main() {
  vec2 img = vec2(vUv.x, 1.0 - vUv.y); // the map as an image: y from the top
  float r = length(vUv - 0.5) * 2.0;
  float fade = clamp((0.9995 - r) / uEdgeFade, 0.0, 1.0);
  vec4 base = texture2D(uBase, vUv);
  float a = base.a * fade;
  if (uHole.w > 0.5 && img.x >= uHole.x && img.x <= uHole.x + uHole.z && img.y >= uHole.y && img.y <= uHole.y + uHole.z) a = 0.0;
  if (a < 0.02) discard;
  vec3 col = base.rgb;

  vec4 layer = vec4(0.0); // premultiplied
  if (uMainOn > 0.5) layer = texture2D(uMain, img);
  if (uSunOn + uEarthOn + uGoOn > 0.5) {
    ivec2 cell = ivec2(clamp(floor(img * float(GRID)), 0.0, float(GRID - 1)));
    if (horizonByte(cell, 0) > 0.5) { // cells outside the 80 S circle have no data
      // Local frame of the cell center (inverse of the polar stereographic map projection).
      vec2 c = (vec2(cell) + 0.5) / float(GRID);
      float x = (c.x - 0.5) * uWidthKm;
      float y = (0.5 - c.y) * uWidthKm;
      float rho = length(vec2(x, y));
      float lat = -0.5 * PI + 2.0 * atan(rho / (2.0 * uMoonKm));
      float lon = atan(x, y);
      vec3 up = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
      vec3 east = vec3(-sin(lon), cos(lon), 0.0);
      vec3 north = vec3(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat));
      float sunMargin = margin(cell, up, east, north, uSunDir) - uMinSun;
      vec3 toEarth = uEarthUnit * uEarthKm - up * uMoonKm;
      float earthMargin = margin(cell, up, east, north, normalize(toEarth)) - uMinEarth;
      if (uGoOn > 0.5) {
        float slope = floor(texelFetch(uSlopeDeg, cell, 0).r * 255.0 + 0.5);
        bool good = slope < uMaxSlope && sunMargin > 0.0 && earthMargin > 0.0;
        layer = good ? vec4(vec3(57.0, 255.0, 20.0) / 255.0 * (210.0 / 255.0), 210.0 / 255.0) : vec4(0.0, 0.0, 0.0, 120.0 / 255.0);
      } else {
        if (uSunOn > 0.5) {
          layer = sunMargin > 0.0
            ? vec4(vec3(255.0, 200.0, 70.0) / 255.0 * (120.0 / 255.0), 120.0 / 255.0)
            : vec4(vec3(5.0, 10.0, 40.0) / 255.0 * (150.0 / 255.0), 150.0 / 255.0);
        }
        if (uEarthOn > 0.5 && earthMargin > 0.0) {
          float ae = 110.0 / 255.0;
          layer = over(vec4(vec3(90.0, 110.0, 255.0) / 255.0 * ae, ae), layer);
        }
      }
    }
  }
  if (uSlopeOn > 0.5) layer = over(texture2D(uSlopeLayer, img), layer);

  if (uFineOn > 0.5) {
    vec4 fine = texture2D(uFine, vUv);
    if (fine.a > 0.25) {
      float fa = clamp((fine.a - 0.5) * 2.0, 0.0, 1.0);
      layer = vec4(fine.rgb * fa, fa);
    }
  }
  col = col * (1.0 - layer.a * uLayerAlpha) + layer.rgb * uLayerAlpha;
  vec4 overlay = texture2D(uOverlay, vUv);
  col = mix(col, overlay.rgb, overlay.a);
  gl_FragColor = vec4(col, a);
}`

function paintedTexture(canvas, { mipmaps, anisotropy }) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.generateMipmaps = mipmaps
  texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter
  texture.magFilter = mipmaps ? THREE.LinearFilter : THREE.NearestFilter
  texture.anisotropy = anisotropy
  return texture
}

function newCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_SIZE
  canvas.height = TEXTURE_SIZE
  return canvas
}

// Bytes in a texture (one per texel, nearest sampling): the horizon atlas and the slopes.
function byteTexture(data, width, height) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType)
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}

// A premultiplied RGBA layer of grid x grid cells, smoothed between cells.
function layerTexture(grid) {
  const data = new Uint8Array(grid * grid * 4)
  const texture = new THREE.DataTexture(data, grid, grid, THREE.RGBAFormat)
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return { texture, data }
}

// The 72 azimuths of every cell as one picture: tile (k % 9, k / 9) holds azimuth k, texel (gx, gy) is cell gy * grid + gx.
function horizonAtlas(terrain) {
  const N = terrain.grid
  const width = N * ATLAS_COLUMNS
  const rows = Math.ceil(AZIMUTHS / ATLAS_COLUMNS)
  const atlas = new Uint8Array(width * N * rows)
  for (let c = 0; c < N * N; c++) {
    const gx = c % N
    const gy = (c - gx) / N
    for (let k = 0; k < AZIMUTHS; k++) {
      const tx = k % ATLAS_COLUMNS
      const ty = (k - tx) / ATLAS_COLUMNS
      atlas[(ty * N + gy) * width + tx * N + gx] = terrain.horizon[c * AZIMUTHS + k]
    }
  }
  return { atlas, width, height: N * rows }
}

/**
 * Creates the cap material for a terrain (see loadTerrain3d: grid, horizon, slope). Returns the canvases to paint
 * (groundTexture.js), the setters, and dispose().
 */
export function createCapMaterial(terrain, anisotropy) {
  const N = terrain.grid
  const baseCanvas = newCanvas()
  const overlayCanvas = newCanvas()
  const fineCanvas = newCanvas()
  const base = paintedTexture(baseCanvas, { mipmaps: true, anisotropy })
  const overlay = paintedTexture(overlayCanvas, { mipmaps: true, anisotropy })
  const fine = paintedTexture(fineCanvas, { mipmaps: false, anisotropy: 1 }) // repainted often: no mipmaps to rebuild
  const { atlas, width, height } = horizonAtlas(terrain)
  const horizon = byteTexture(atlas, width, height)
  const slopeDeg = byteTexture(terrain.slope, N, N)
  const main = layerTexture(N)
  const slopeLayer = layerTexture(N)
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: fragment(N),
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uBase: { value: base },
      uOverlay: { value: overlay },
      uFine: { value: fine },
      uHorizon: { value: horizon },
      uSlopeDeg: { value: slopeDeg },
      uMain: { value: main.texture },
      uSlopeLayer: { value: slopeLayer.texture },
      uWidthKm: { value: 2 * MAP_RADIUS_KM },
      uMoonKm: { value: MOON_RADIUS_M / 1000 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uEarthUnit: { value: new THREE.Vector3(1, 0, 0) },
      uEarthKm: { value: 384400 },
      uMinSun: { value: 0 },
      uMinEarth: { value: 0 },
      uMaxSlope: { value: 15 },
      uSunOn: { value: 0 },
      uEarthOn: { value: 0 },
      uGoOn: { value: 0 },
      uMainOn: { value: 0 },
      uSlopeOn: { value: 0 },
      uLayerAlpha: { value: 1 },
      uFineOn: { value: 0 },
      uEdgeFade: { value: 0.05 },
      uHole: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
  })
  const u = material.uniforms
  return {
    material,
    baseCanvas,
    overlayCanvas,
    fineCanvas,
    refreshBase() {
      base.needsUpdate = true
    },
    refreshOverlay() {
      overlay.needsUpdate = true
    },
    /** Opacity of the layers over the ground (the photograph shows through) and the width of the fade at the rim (fraction of the radius). */
    setLook({ layerAlpha, edgeFade }) {
      u.uLayerAlpha.value = layerAlpha
      u.uEdgeFade.value = Math.max(edgeFade, 1e-4)
    },
    /**
     * The layers computed on the GPU for the moment shown: { sun, earth, go } (which ones), the unit vector toward the Sun, the
     * unit vector of the sub-Earth point and the Earth distance (km), the thresholds { minSunDeg, minEarthDeg, maxSlopeDeg }.
     */
    setLive({ sun, earth, go }, { sunDir, earthUnit, earthKm }, { minSunDeg, minEarthDeg, maxSlopeDeg }) {
      u.uSunOn.value = sun ? 1 : 0
      u.uEarthOn.value = earth ? 1 : 0
      u.uGoOn.value = go ? 1 : 0
      u.uSunDir.value.fromArray(sunDir)
      u.uEarthUnit.value.fromArray(earthUnit)
      u.uEarthKm.value = earthKm
      u.uMinSun.value = minSunDeg
      u.uMinEarth.value = minEarthDeg
      u.uMaxSlope.value = maxSlopeDeg
    },
    /** The layers that do not depend on the moment: premultiplied RGBA pictures (grid x grid, rows from the top) or null. */
    setStatic({ main: mainRgba, slope: slopeRgba }) {
      u.uMainOn.value = mainRgba ? 1 : 0
      if (mainRgba) {
        main.data.set(mainRgba)
        main.texture.needsUpdate = true
      }
      u.uSlopeOn.value = slopeRgba ? 1 : 0
      if (slopeRgba) {
        slopeLayer.data.set(slopeRgba)
        slopeLayer.texture.needsUpdate = true
      }
    },
    /** The fine canvas has just been painted (true), or is empty and unused (false). */
    refreshFine(on) {
      u.uFineOn.value = on ? 1 : 0
      if (on) fine.needsUpdate = true
    },
    /** A square of the map left transparent: { x, y, side } (fractions of its width, y from the top), or null. */
    setHole(rect) {
      u.uHole.value.set(rect ? rect.x : 0, rect ? rect.y : 0, rect ? rect.side : 0, rect ? 1 : 0)
    },
    dispose() {
      for (const t of [base, overlay, fine, horizon, slopeDeg, main.texture, slopeLayer.texture]) t.dispose()
      material.dispose()
    },
  }
}
