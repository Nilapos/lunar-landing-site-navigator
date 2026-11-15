// The material of a fine zone (see zones.js): the same pieces as the cap (capMaterial.js), for a square of 16 km:
//   imagery  (2048 canvas): the Moon Trek imagery sharpened for the zone (tileWindow.js), under it the zone's own hillshade picture until
//            the tiles have come;
//   layer    (cells x cells data texture, premultiplied, one texel per cell, no smoothing so each cell stays a crisp square): the layers
//            computed on the cells of the zone for the moment shown, laid over the imagery with the same opacity as on the cap;
//   grid     (2048 canvas): the graticule with its values, drawn for the zone's window (mapGrid.js).
import * as THREE from 'three'

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAGMENT = `
precision highp float;
uniform sampler2D uImagery;
uniform sampler2D uGrid;
uniform sampler2D uLayer;
uniform sampler2D uHillshade; // the zone's own hillshade picture
uniform float uShade;         // relief shading of the 2D map's relief setting (none at x1: the imagery has its own)
uniform float uLayerOn;
uniform float uLayerAlpha;
varying vec2 vUv;
// The "overlay" blend of the relief shading over a color (what the canvas did once): dark and light of the hillshade add relief.
vec3 overlayBlend(vec3 b, float s) { return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b)); }
void main() {
  vec3 col = texture2D(uImagery, vUv).rgb;
  col = mix(col, overlayBlend(col, texture2D(uHillshade, vUv).r), uShade);
  if (uLayerOn > 0.5) {
    vec4 layer = texture2D(uLayer, vec2(vUv.x, 1.0 - vUv.y)); // the data rows run from the top of the zone
    col = col * (1.0 - layer.a * uLayerAlpha) + layer.rgb * uLayerAlpha;
  }
  vec4 grid = texture2D(uGrid, vUv);
  col = mix(col, grid.rgb, grid.a);
  gl_FragColor = vec4(col, 1.0);
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

function canvasTexture(canvas, anisotropy) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = anisotropy
  return texture
}

/** Creates the zone material. Returns the canvases to draw, the setters, and dispose(). */
export function createZoneMaterial(anisotropy, size = 2048) {
  const imageryCanvas = document.createElement('canvas')
  const gridCanvas = document.createElement('canvas')
  imageryCanvas.width = imageryCanvas.height = gridCanvas.width = gridCanvas.height = size
  const imagery = canvasTexture(imageryCanvas, anisotropy)
  const grid = canvasTexture(gridCanvas, anisotropy)
  const hillshadeTexture = new THREE.CanvasTexture(grayPixel())
  hillshadeTexture.colorSpace = THREE.NoColorSpace
  hillshadeTexture.anisotropy = anisotropy
  let layer = null // { texture, data, cells }
  const emptyLayer = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat)
  emptyLayer.needsUpdate = true
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    uniforms: {
      uImagery: { value: imagery },
      uGrid: { value: grid },
      uLayer: { value: emptyLayer },
      uHillshade: { value: hillshadeTexture },
      uShade: { value: 0 },
      uLayerOn: { value: 0 },
      uLayerAlpha: { value: 1 },
    },
  })
  const u = material.uniforms
  return {
    material,
    imageryCanvas,
    gridCanvas,
    refreshImagery() {
      imagery.needsUpdate = true
    },
    refreshGrid() {
      grid.needsUpdate = true
    },
    setLook(layerAlpha) {
      u.uLayerAlpha.value = layerAlpha
    },
    /** The zone's hillshade picture, and the relief setting of the 2D map (1 to 4) that strengthens its shading over the imagery. */
    setHillshade(image) {
      hillshadeTexture.image = image
      hillshadeTexture.needsUpdate = true
    },
    setRelief(value) {
      u.uShade.value = Math.min(0.9, 0.3 * (value - 1))
    },
    /** The layers of the cells of the zone: premultiplied RGBA (cells x cells, rows from the top), or null for none. */
    setLayer(rgba, cells) {
      u.uLayerOn.value = rgba ? 1 : 0
      if (!rgba) return
      if (!layer || layer.cells !== cells) {
        layer?.texture.dispose()
        const data = new Uint8Array(cells * cells * 4)
        const texture = new THREE.DataTexture(data, cells, cells, THREE.RGBAFormat)
        texture.minFilter = texture.magFilter = THREE.NearestFilter
        texture.generateMipmaps = false
        layer = { texture, data, cells }
        u.uLayer.value = texture
      }
      layer.data.set(rgba)
      layer.texture.needsUpdate = true
    },
    dispose() {
      imagery.dispose()
      hillshadeTexture.dispose()
      grid.dispose()
      emptyLayer.dispose()
      layer?.texture.dispose()
      material.dispose()
    },
  }
}
