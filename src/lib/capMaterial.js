// The material of the south polar cap. The ground is made of separate pieces combined by the GPU, so that a step of the timeline
// costs a few uniforms instead of repainting and re-uploading a 2048 x 2048 picture:
//   base     (2048 canvas, painted once): the LRO photograph + light relief shading;
//   live     (computed on the GPU per 2.4 km cell, baked once per step of the timeline into a grid x grid render target, so the
//            cap's own shader, run for every pixel of every frame, only reads it): sunlight and shadows, Earth visibility and the
//            instant "Optimal" layer, from the Sun and Earth directions (uniforms), the local frame of the cell (analytic) and the
//            terrain horizon of the cell (an atlas texture of the same bytes as horizonGrid.js). Same rules and colors as
//            illumination.js;
//   static   (grid x grid data textures, premultiplied, uploaded only when their inputs change): the layers that do not depend on
//            the moment: "Optimal over the period", "Feasible" and the forbidden zones (slope);
//   fine     (2048 canvas, only drawn while 500 m chunks are loaded): the same layers at the chunks' own resolution. Inside a chunk
//            its alpha is 0.5 + layer alpha / 2, and 0 elsewhere, so the alpha also tells where the chunk replaces the overview layer;
//   window   (two 2048 canvases, redrawn when the camera moves enough): a square window of the map that follows the zoom, drawn at the
//            resolution of the screen: `detail` (the Moon Trek imagery sharpened for that window, and the PSR / rock abundance layers) over
//            the photo, and `grid` (the latitude / longitude graticule with its labels and the candidate regions), see tileWindow.js.
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

// The live layers of one cell: premultiplied color of sunlight / shadow + Earth, or of the instant Optimal layer.
const liveChunk = (grid) => `
precision highp float;
precision highp int;
precision highp sampler2D;
#define GRID ${grid}
#define AZIMUTHS ${AZIMUTHS}
#define COLUMNS ${ATLAS_COLUMNS}
const float PI = 3.14159265358979;
uniform sampler2D uHorizon;   // R8, bytes of horizonGrid.js laid out as an atlas
uniform sampler2D uSlopeDeg;  // R8, slope of the cells in degrees
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

// \`img\`: position on the map as an image (y from the top).
vec4 liveLayer(vec2 img) {
  vec4 layer = vec4(0.0); // premultiplied
  ivec2 cell = ivec2(clamp(floor(img * float(GRID)), 0.0, float(GRID - 1)));
  if (horizonByte(cell, 0) < 0.5) return layer; // cells outside the 80 S circle have no data
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
    return good ? vec4(vec3(57.0, 255.0, 20.0) / 255.0 * (210.0 / 255.0), 210.0 / 255.0) : vec4(0.0, 0.0, 0.0, 120.0 / 255.0);
  }
  if (uSunOn > 0.5) {
    layer = sunMargin > 0.0
      ? vec4(vec3(255.0, 200.0, 70.0) / 255.0 * (120.0 / 255.0), 120.0 / 255.0)
      : vec4(vec3(5.0, 10.0, 40.0) / 255.0 * (150.0 / 255.0), 150.0 / 255.0);
  }
  if (uEarthOn > 0.5 && earthMargin > 0.0) {
    float ae = 110.0 / 255.0;
    layer = over(vec4(vec3(90.0, 110.0, 255.0) / 255.0 * ae, ae), layer);
  }
  return layer;
}`

// Renders the live layers of every cell into the grid x grid target (one texel per cell, rows as the quad's uv: y up).
const BAKE_FRAGMENT = (grid) => `${liveChunk(grid)}
varying vec2 vUv;
void main() {
  gl_FragColor = liveLayer(vec2(vUv.x, 1.0 - vUv.y));
}`

// The cap itself: runs for every pixel of every frame, so it only combines pictures.
const CAP_FRAGMENT = `
precision highp float;
uniform sampler2D uBase;
uniform sampler2D uOverlay;   // the grid of the window (graticule, labels, regions)
uniform sampler2D uDetail;    // the detail of the window (imagery sharpened for the zoom, PSR, rock abundance)
uniform sampler2D uHillshade; // the relief picture, laid over the photograph (uShade) and over the detail (uShadeDetail)
uniform float uShade;
uniform float uShadeDetail;
uniform sampler2D uFine;
uniform sampler2D uLive;      // the baked live layers (premultiplied), see BAKE_FRAGMENT
uniform sampler2D uMain;      // premultiplied RGBA: Optimal over the period, or Feasible
uniform sampler2D uSlopeLayer;// premultiplied RGBA: forbidden zones
uniform float uDetailOn;
uniform vec3 uWindow;         // cx, cy, span (km, map plane) of the window the two canvases above are drawn for
uniform float uMapKm;         // side of the whole map (km)
uniform float uLiveOn;
uniform float uMainOn;
uniform float uSlopeOn;
uniform float uLayerAlpha;
uniform float uFineOn;
uniform float uEdgeFade;
uniform vec4 uHole; // x, y, side (fractions of the map, y from the top), on
varying vec2 vUv;

// The "overlay" blend of the relief shading over a color (what the canvas did once): dark and light of the hillshade add relief.
vec3 overlayBlend(vec3 b, float s) { return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b)); }

vec4 over(vec4 top, vec4 bottom) { return top + bottom * (1.0 - top.a); } // premultiplied

void main() {
  vec2 img = vec2(vUv.x, 1.0 - vUv.y); // the map as an image: y from the top
  float shade = texture2D(uHillshade, vUv).r;
  float r = length(vUv - 0.5) * 2.0;
  float fade = clamp((0.9995 - r) / uEdgeFade, 0.0, 1.0);
  vec4 base = texture2D(uBase, vUv);
  float a = base.a * fade;
  if (uHole.w > 0.5 && img.x >= uHole.x && img.x <= uHole.x + uHole.z && img.y >= uHole.y && img.y <= uHole.y + uHole.z) a = 0.0;
  if (a < 0.02) discard;
  vec3 col = mix(base.rgb, overlayBlend(base.rgb, shade), uShade);
  // The window: where this pixel is in it, if it is.
  vec2 w = ((vUv - 0.5) * uMapKm - uWindow.xy) / uWindow.z + 0.5;
  bool inWindow = w.x >= 0.0 && w.x <= 1.0 && w.y >= 0.0 && w.y <= 1.0;
  if (uDetailOn > 0.5 && inWindow) {
    vec4 detail = texture2D(uDetail, w);
    float feather = smoothstep(0.0, 0.02, min(min(w.x, 1.0 - w.x), min(w.y, 1.0 - w.y)));
    vec3 sharp = mix(detail.rgb, overlayBlend(detail.rgb, shade), uShadeDetail);
    col = mix(col, sharp, detail.a * feather);
  }

  vec4 layer = vec4(0.0); // premultiplied
  if (uMainOn > 0.5) layer = texture2D(uMain, img);
  if (uLiveOn > 0.5) layer = texture2D(uLive, vUv);
  if (uSlopeOn > 0.5) layer = over(texture2D(uSlopeLayer, img), layer);

  if (uFineOn > 0.5) {
    vec4 fine = texture2D(uFine, vUv);
    if (fine.a > 0.25) {
      float fa = clamp((fine.a - 0.5) * 2.0, 0.0, 1.0);
      layer = vec4(fine.rgb * fa, fa);
    }
  }
  col = col * (1.0 - layer.a * uLayerAlpha) + layer.rgb * uLayerAlpha;
  if (inWindow) {
    vec4 grid = texture2D(uOverlay, w);
    col = mix(col, grid.rgb, grid.a);
  }
  gl_FragColor = vec4(col, a);
}`

// A neutral 1 x 1 picture until the real hillshade comes (no shading).
function grayPixel() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, 1, 1)
  return canvas
}

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

// The bake draws one quad over the whole target, in clip space.
const BAKE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

/**
 * Creates the cap material for a terrain (see loadTerrain3d: grid, horizon, slope). `renderer` bakes the live layers.
 * Returns the canvases to paint (groundTexture.js), the setters, and dispose().
 */
export function createCapMaterial(renderer, terrain, anisotropy) {
  const N = terrain.grid
  const baseCanvas = newCanvas()
  const overlayCanvas = newCanvas() // the grid of the window
  const detailCanvas = newCanvas() // the detail of the window
  const fineCanvas = newCanvas()
  const base = paintedTexture(baseCanvas, { mipmaps: true, anisotropy })
  const overlay = paintedTexture(overlayCanvas, { mipmaps: true, anisotropy })
  const detail = paintedTexture(detailCanvas, { mipmaps: true, anisotropy })
  const hillshadeTexture = new THREE.CanvasTexture(grayPixel())
  hillshadeTexture.colorSpace = THREE.NoColorSpace
  hillshadeTexture.generateMipmaps = true
  hillshadeTexture.minFilter = THREE.LinearMipmapLinearFilter
  hillshadeTexture.anisotropy = anisotropy
  let shadeBase = 0 // strength of the shading over the photograph (groundLook.reliefShading), times the relief setting below
  let relief = 1
  const fine = paintedTexture(fineCanvas, { mipmaps: false, anisotropy: 1 }) // repainted often: no mipmaps to rebuild
  const { atlas, width, height } = horizonAtlas(terrain)
  const horizon = byteTexture(atlas, width, height)
  const slopeDeg = byteTexture(terrain.slope, N, N)
  const main = layerTexture(N)
  const slopeLayer = layerTexture(N)

  // The live layers: baked into one texel per cell, with the uniforms below.
  const live = {
    uHorizon: { value: horizon },
    uSlopeDeg: { value: slopeDeg },
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
  }
  const target = new THREE.WebGLRenderTarget(N, N, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    generateMipmaps: false,
  })
  target.texture.colorSpace = THREE.NoColorSpace
  const bakeMaterial = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERTEX,
    fragmentShader: BAKE_FRAGMENT(N),
    uniforms: live,
    depthTest: false,
    depthWrite: false,
  })
  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMaterial)
  bakeQuad.frustumCulled = false
  const bakeScene = new THREE.Scene()
  bakeScene.add(bakeQuad)
  const bakeCamera = new THREE.Camera()
  const bake = () => {
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(target)
    renderer.render(bakeScene, bakeCamera)
    renderer.setRenderTarget(previous)
  }

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: CAP_FRAGMENT,
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      uBase: { value: base },
      uOverlay: { value: overlay },
      uDetail: { value: detail },
      uHillshade: { value: hillshadeTexture },
      uShade: { value: 0 },
      uShadeDetail: { value: 0 },
      uDetailOn: { value: 0 },
      uWindow: { value: new THREE.Vector3(0, 0, 2 * MAP_RADIUS_KM) },
      uMapKm: { value: 2 * MAP_RADIUS_KM },
      uFine: { value: fine },
      uLive: { value: target.texture },
      uMain: { value: main.texture },
      uSlopeLayer: { value: slopeLayer.texture },
      uLiveOn: { value: 0 },
      uMainOn: { value: 0 },
      uSlopeOn: { value: 0 },
      uLayerAlpha: { value: 1 },
      uFineOn: { value: 0 },
      uEdgeFade: { value: 0.05 },
      uHole: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
  })
  const u = material.uniforms
  function applyRelief() {
    u.uShade.value = Math.min(1, shadeBase * relief)
    u.uShadeDetail.value = shadeBase > 0 ? Math.min(0.9, 0.3 * (relief - 1)) : 0 // none at x1: the sharp imagery has its own shading
  }
  return {
    material,
    baseCanvas,
    overlayCanvas,
    detailCanvas,
    fineCanvas,
    refreshBase() {
      base.needsUpdate = true
    },
    refreshOverlay() {
      overlay.needsUpdate = true
    },
    /** The detail canvas has been (re)drawn. */
    refreshDetail(on = true) {
      u.uDetailOn.value = on ? 1 : 0
      if (on) detail.needsUpdate = true
    },
    /** The window of the map ({ cx, cy, span }, km) the grid and detail canvases are drawn for. */
    setWindow({ cx, cy, span }) {
      u.uWindow.value.set(cx, cy, span)
    },
    /** Opacity of the layers over the ground (the photograph shows through) and the width of the fade at the rim (fraction of the radius). */
    setLook({ layerAlpha, edgeFade, reliefShading = 0 }) {
      u.uLayerAlpha.value = layerAlpha
      u.uEdgeFade.value = Math.max(edgeFade, 1e-4)
      shadeBase = reliefShading
      applyRelief()
    },
    /** The relief picture (hillshade of the LOLA map), laid over the photograph by the shader. */
    setHillshade(image) {
      hillshadeTexture.image = image
      hillshadeTexture.needsUpdate = true
    },
    /** The relief setting (1 to 4) of the 2D map, where the relief cannot be raised: it strengthens the shading (x1 is the default look). */
    setRelief(value) {
      relief = value
      applyRelief()
    },
    /**
     * The layers computed on the GPU for the moment shown: { sun, earth, go } (which ones), the unit vector toward the Sun, the
     * unit vector of the sub-Earth point and the Earth distance (km), the thresholds { minSunDeg, minEarthDeg, maxSlopeDeg }.
     * The cells are computed here, once, not for every pixel of every frame.
     */
    setLive({ sun, earth, go }, { sunDir, earthUnit, earthKm }, { minSunDeg, minEarthDeg, maxSlopeDeg }) {
      live.uSunOn.value = sun ? 1 : 0
      live.uEarthOn.value = earth ? 1 : 0
      live.uGoOn.value = go ? 1 : 0
      live.uSunDir.value.fromArray(sunDir)
      live.uEarthUnit.value.fromArray(earthUnit)
      live.uEarthKm.value = earthKm
      live.uMinSun.value = minSunDeg
      live.uMinEarth.value = minEarthDeg
      live.uMaxSlope.value = maxSlopeDeg
      const on = sun || earth || go
      u.uLiveOn.value = on ? 1 : 0
      if (on) bake()
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
      hillshadeTexture.dispose()
      for (const t of [base, overlay, detail, fine, horizon, slopeDeg, main.texture, slopeLayer.texture]) t.dispose()
      target.dispose()
      bakeQuad.geometry.dispose()
      bakeMaterial.dispose()
      material.dispose()
    },
  }
}
