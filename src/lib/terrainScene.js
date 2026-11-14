// The 3D scene of the south pole (three.js): relief mesh, a texture we can repaint, site markers, orbit camera.
// World units are kilometers: x to the east (right), z toward lon 180 (toward the viewer), y up.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { projectToMap } from './polarMap.js'
import { sampleHeight } from './terrain3d.js'

export const TEXTURE_SIZE = 1024
const LEVEL_COLOR = { ok: 0x6ee7a8, warn: 0xffb74d, fail: 0xff8a80, unknown: 0x9aa3b5 }

function makeLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 8
  ctx.strokeStyle = '#000'
  ctx.strokeText(text, 256, 48)
  ctx.fillStyle = '#fff'
  ctx.fillText(text, 256, 48)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
  sprite.scale.set(110, 20.6, 1)
  sprite.renderOrder = 10
  return sprite
}

/**
 * Creates the scene inside `container`. Returns methods to change what is shown, and dispose().
 * onPick(siteId) is called when a marker is clicked.
 */
export function createTerrainScene(container, terrain, { onPick }) {
  const N = terrain.grid
  const width = terrain.radiusKm * 2
  let exaggeration = 4
  let sites = []

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x05070b)
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 6000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = 60
  controls.maxDistance = 1600
  controls.maxPolarAngle = Math.PI * 0.49

  function resetView() {
    camera.position.set(0, width * 0.62, width * 0.78)
    controls.target.set(0, 0, 0)
    controls.update()
  }
  resetView()
  if (import.meta.env.DEV) window.__terrainDebug = { camera, controls }

  // Texture: a canvas the caller paints (hillshade + layers), then refreshTexture().
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_SIZE
  canvas.height = TEXTURE_SIZE
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()

  // Relief mesh: one vertex per grid cell center, texture coordinates cover the whole picture.
  const positions = new Float32Array(N * N * 3)
  const uvs = new Float32Array(N * N * 2)
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const i = gy * N + gx
      positions[i * 3] = ((gx + 0.5) / N - 0.5) * width
      positions[i * 3 + 2] = ((gy + 0.5) / N - 0.5) * width
      uvs[i * 2] = (gx + 0.5) / N
      uvs[i * 2 + 1] = 1 - (gy + 0.5) / N
    }
  }
  const indices = []
  for (let gy = 0; gy < N - 1; gy++) {
    for (let gx = 0; gx < N - 1; gx++) {
      const a = gy * N + gx
      const b = a + 1
      const c = a + N
      const d = c + 1
      indices.push(a, c, b, b, c, d) // counter-clockwise seen from above
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  function applyExaggeration() {
    for (let i = 0; i < N * N; i++) positions[i * 3 + 1] = (terrain.heights[i] / 1000) * exaggeration
    geometry.attributes.position.needsUpdate = true
    geometry.computeBoundingSphere()
  }
  applyExaggeration()

  // Site markers: a pin with a colored head, a ring and a label for the selected ones, and an invisible larger sphere to click.
  const markers = new THREE.Group()
  scene.add(markers)
  const hitMeshes = []
  function clearMarkers() {
    for (const obj of [...markers.children]) {
      markers.remove(obj)
      obj.traverse((o) => {
        o.geometry?.dispose()
        if (o.material) {
          o.material.map?.dispose()
          o.material.dispose()
        }
      })
    }
    hitMeshes.length = 0
  }
  function buildMarkers() {
    clearMarkers()
    for (const s of sites) {
      const { x: fx, y: fy } = projectToMap(s.lat, s.lon)
      const ground = (sampleHeight(terrain, fx, fy) / 1000) * exaggeration
      const group = new THREE.Group()
      group.position.set((fx - 0.5) * width, ground, (fy - 0.5) * width)
      const color = LEVEL_COLOR[s.level] ?? LEVEL_COLOR.unknown
      const pinHeight = 22
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, pinHeight, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      pin.position.y = pinHeight / 2
      const head = new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 14), new THREE.MeshBasicMaterial({ color }))
      head.position.y = pinHeight + 3
      group.add(pin, head)
      if (s.selectedLabels.length) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.9, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd166 }))
        ring.rotation.x = Math.PI / 2
        ring.position.y = 1
        group.add(ring)
      }
      const label = makeLabel(s.selectedLabels.length ? `${s.shortName} (${s.selectedLabels.join(', ')})` : s.shortName)
      label.position.y = pinHeight + 17
      group.add(label)
      const hit = new THREE.Mesh(new THREE.SphereGeometry(11, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
      hit.position.y = pinHeight
      hit.userData.siteId = s.id
      group.add(hit)
      hitMeshes.push(hit)
      markers.add(group)
    }
  }

  // Clicking a marker (a click, not a drag of the camera).
  const raycaster = new THREE.Raycaster()
  let downAt = null
  const el = renderer.domElement
  const onDown = (e) => {
    downAt = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
    const rect = el.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.intersectObjects(hitMeshes, false)[0]
    if (hit) onPick(hit.object.userData.siteId)
  }
  // The wheel only zooms after a click on the view, so scrolling the page over it does not move the camera.
  controls.enableZoom = false
  const enableZoom = () => {
    controls.enableZoom = true
  }
  const disableZoom = () => {
    controls.enableZoom = false
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerdown', enableZoom)
  el.addEventListener('pointerleave', disableZoom)
  el.addEventListener('pointerup', onUp)

  // Size follows the container.
  const resize = () => {
    const w = Math.max(container.clientWidth, 1)
    const h = Math.max(container.clientHeight, 1)
    renderer.setSize(w, h, false)
    el.style.width = '100%'
    el.style.height = '100%'
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
  })

  return {
    /** The canvas behind the relief texture: paint on it, then call refreshTexture(). */
    textureCanvas: canvas,
    refreshTexture() {
      texture.needsUpdate = true
    },
    setExaggeration(value) {
      exaggeration = value
      applyExaggeration()
      buildMarkers()
    },
    /** sites: [{ id, shortName, lat, lon, level, selectedLabels }] */
    setSites(list) {
      sites = list
      buildMarkers()
    },
    resetView,
    dispose() {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerdown', enableZoom)
      el.removeEventListener('pointerleave', disableZoom)
      el.removeEventListener('pointerup', onUp)
      clearMarkers()
      geometry.dispose()
      material.dispose()
      texture.dispose()
      controls.dispose()
      renderer.dispose()
      el.remove()
    },
  }
}
