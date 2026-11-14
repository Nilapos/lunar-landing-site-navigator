// The "Polar sky" scene (three.js): the south polar cap on the real sphere, with the Sun and the Earth in the sky
// at their true direction and angular size. The geometry and wording live in polarSky.js (tested); this file
// only draws. Frame: Moon-fixed, kilometers, z north, so "up" at the south pole is -z.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TEXTURE_SIZE } from './groundTexture.js'
import {
  capIndices,
  capPositions,
  EARTH_RADIUS_KM,
  earthPosition,
  MOON_RADIUS_KM,
  placeBody,
  SUN_ANGULAR_RADIUS_DEG,
  sunDirection,
  surfacePoint,
} from './polarSky.js'
import { makeEarthCanvas, makeMoonCanvas, makeReticleCanvas, makeSunGlowCanvas } from './skyTextures.js'
import { LEVEL_COLOR, makeLabel } from './terrainScene.js'

const RAD = Math.PI / 180
const DISPLAY_KM = 40000 // the bodies are drawn this far from the camera (true direction, true angular size)
const SUN_GLOW_DEG = 11 // width of the glare picture; the disc inside it keeps the Sun's true size
const SUN_COLOR = 0xffd166
const EARTH_COLOR = 0x6e8cff
const SOUTH = new THREE.Vector3(0, 0, -1)
const Y_AXIS = new THREE.Vector3(0, 1, 0)

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose()
    if (o.material) {
      o.material.map?.dispose()
      o.material.dispose()
    }
  })
}

/**
 * Creates the scene inside `container`. Callbacks: onPick(siteId) for a click on a pin, onProbe(cell | null)
 * when the pointer moves over the ground, onPin(cell) for a click on the ground.
 */
export function createPolarSkyScene(container, terrain, { onPick, onProbe, onPin }) {
  const N = terrain.grid
  let exaggeration = 2
  let sites = []
  let sample = null
  let focus = null // { lat, lon, sunVisible, earthVisible }: the site the lines start from

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)
  const el = renderer.domElement
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  const camera = new THREE.PerspectiveCamera(50, 1, 2, 120000)
  camera.up.copy(SOUTH) // must be set before the controls are created
  const controls = new OrbitControls(camera, el)
  controls.enableDamping = true
  controls.minDistance = 80
  controls.maxDistance = 9000
  controls.maxPolarAngle = Math.PI * 0.47

  // Default view: above the far side of the cap, looking over the pole toward lon 0, where the Earth hangs.
  function resetView() {
    camera.position.set(-700, 0, -(MOON_RADIUS_KM + 300))
    controls.target.set(350, 0, -MOON_RADIUS_KM)
    controls.update()
  }
  resetView()

  // The Sun lights the Earth and the Moon around the cap; the cap itself shows the painted layers.
  const sunLight = new THREE.DirectionalLight(0xffffff, 3)
  scene.add(sunLight)

  // --- Ground: the cap (same texture canvas as the Terrain view) and the smooth sphere around it.
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_SIZE
  canvas.height = TEXTURE_SIZE
  const texture = canvasTexture(canvas)
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()

  const positions = capPositions(terrain, exaggeration)
  const uvs = new Float32Array(N * N * 2)
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      uvs[(gy * N + gx) * 2] = (gx + 0.5) / N
      uvs[(gy * N + gx) * 2 + 1] = 1 - (gy + 0.5) / N
    }
  }
  const capGeometry = new THREE.BufferGeometry()
  capGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  capGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  capGeometry.setIndex(new THREE.BufferAttribute(capIndices(N), 1))
  capGeometry.computeBoundingSphere()
  const cap = new THREE.Mesh(capGeometry, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide }))
  scene.add(cap)

  // The rest of the Moon: a sphere open at the south (the cap covers the hole), just under the cap's rim.
  const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS_KM - 0.3, 144, 72, 0, Math.PI * 2, 0, Math.PI - 9.9 * RAD)
  moonGeometry.rotateX(Math.PI / 2) // the sphere's axis (y) becomes the polar axis (z)
  const moonTexture = canvasTexture(makeMoonCanvas())
  const moon = new THREE.Mesh(
    moonGeometry,
    new THREE.MeshLambertMaterial({ map: moonTexture, emissive: 0xffffff, emissiveMap: moonTexture, emissiveIntensity: 0.32 }),
  )
  scene.add(moon)

  // --- Sky: the Sun (true-size disc + glare) and the Earth (lit by the Sun, so its phase is right).
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: canvasTexture(makeSunGlowCanvas()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  )
  const earthGeometry = new THREE.SphereGeometry(1, 48, 32)
  earthGeometry.rotateX(Math.PI / 2)
  const earth = new THREE.Mesh(
    earthGeometry,
    new THREE.MeshLambertMaterial({ map: canvasTexture(makeEarthCanvas()), emissive: 0x0a1020 }),
  )
  const sky = new THREE.Group()
  sky.add(sunDisc, sunGlow, earth)
  sky.visible = false
  scene.add(sky)

  // --- Lines from the selected site to each body: solid when the body is visible from the site, faint when hidden.
  const makeLine = (color) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true }))
    line.frustumCulled = false
    line.visible = false
    scene.add(line)
    return line
  }
  const sunLine = makeLine(SUN_COLOR)
  const earthLine = makeLine(EARTH_COLOR)
  const focusPoint = new THREE.Vector3()
  function updateFocus() {
    const show = !!(focus && sample)
    sunLine.visible = show
    earthLine.visible = show
    if (!show) return
    focusPoint.fromArray(surfacePoint(terrain, focus.lat, focus.lon, exaggeration, 1))
    sunLine.material.opacity = focus.sunVisible ? 0.95 : 0.25
    earthLine.material.opacity = focus.earthVisible ? 0.95 : 0.25
  }
  function setLine(line, end) {
    const p = line.geometry.attributes.position
    p.setXYZ(0, focusPoint.x, focusPoint.y, focusPoint.z)
    p.setXYZ(1, end.x, end.y, end.z)
    p.needsUpdate = true
  }

  // Bodies follow the camera: same direction and angular size as the real ones, at a convenient distance.
  function updateSky() {
    if (!sample) return
    const cam = camera.position.toArray()
    const sun = placeBody(cam, { direction: sunDirection(sample), angularRadiusDeg: SUN_ANGULAR_RADIUS_DEG }, DISPLAY_KM)
    sunDisc.position.fromArray(sun.position)
    sunDisc.scale.setScalar(sun.radius)
    sunGlow.position.copy(sunDisc.position)
    sunGlow.scale.setScalar(2 * DISPLAY_KM * Math.tan((SUN_GLOW_DEG / 2) * RAD))
    const placed = placeBody(cam, { position: earthPosition(sample), radiusKm: EARTH_RADIUS_KM }, DISPLAY_KM)
    earth.position.fromArray(placed.position)
    earth.scale.setScalar(placed.radius)
    if (sunLine.visible) {
      setLine(sunLine, sunDisc.position)
      setLine(earthLine, earth.position)
    }
  }

  // --- Site pins, standing along the local vertical.
  const markers = new THREE.Group()
  scene.add(markers)
  const hitMeshes = []
  function clearMarkers() {
    for (const obj of [...markers.children]) {
      markers.remove(obj)
      disposeTree(obj)
    }
    hitMeshes.length = 0
  }
  function buildMarkers() {
    clearMarkers()
    for (const s of sites) {
      const group = new THREE.Group()
      group.position.fromArray(surfacePoint(terrain, s.lat, s.lon, exaggeration))
      group.quaternion.setFromUnitVectors(Y_AXIS, group.position.clone().normalize())
      const color = LEVEL_COLOR[s.level] ?? LEVEL_COLOR.unknown
      const pinHeight = 16
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, pinHeight, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      pin.position.y = pinHeight / 2
      const head = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 14), new THREE.MeshBasicMaterial({ color }))
      head.position.y = pinHeight + 2
      group.add(pin, head)
      if (s.selectedLabels.length) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.7, 8, 32), new THREE.MeshBasicMaterial({ color: SUN_COLOR }))
        ring.rotation.x = Math.PI / 2
        ring.position.y = 1
        group.add(ring)
      }
      const label = makeLabel(s.selectedLabels.length ? `${s.shortName} (${s.selectedLabels.join(', ')})` : s.shortName)
      label.scale.multiplyScalar(0.9)
      label.position.y = pinHeight + 14
      group.add(label)
      const hit = new THREE.Mesh(new THREE.SphereGeometry(9, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
      hit.position.y = pinHeight
      hit.userData.siteId = s.id
      group.add(hit)
      hitMeshes.push(hit)
      markers.add(group)
    }
  }

  // --- Hover probe: the grid cell under the pointer, marked by a reticle.
  const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(makeReticleCanvas()), depthTest: false, transparent: true }))
  reticle.scale.setScalar(44)
  reticle.renderOrder = 9
  reticle.visible = false
  scene.add(reticle)
  let reticleCell = null
  function placeReticle() {
    reticle.visible = reticleCell !== null
    if (reticleCell !== null) reticle.position.fromArray(positions, reticleCell * 3).multiplyScalar(1 + 1 / MOON_RADIUS_KM)
  }

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const vertex = new THREE.Vector3()
  function pointerRay(e) {
    const rect = el.getBoundingClientRect()
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
  }
  // The cell whose center is the closest corner of the triangle under the pointer (one vertex per cell).
  function cellUnderPointer() {
    const hit = raycaster.intersectObject(cap, false)[0]
    if (!hit) return null
    let best = null
    let bestDistance = Infinity
    for (const index of [hit.face.a, hit.face.b, hit.face.c]) {
      const d = vertex.fromArray(positions, index * 3).distanceToSquared(hit.point)
      if (d < bestDistance) {
        bestDistance = d
        best = index
      }
    }
    return best
  }

  let downAt = null
  let dragging = false
  let hoverEvent = null // the last pointer move, handled once per frame
  let hoverCell = null
  const onDown = (e) => {
    downAt = { x: e.clientX, y: e.clientY }
    dragging = true
    controls.enableZoom = true // the wheel only zooms after a click, so scrolling the page does not move the camera
  }
  const onMove = (e) => {
    if (!dragging && e.pointerType !== 'touch') hoverEvent = e
  }
  const onUp = (e) => {
    dragging = false
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
    pointerRay(e)
    const pin = raycaster.intersectObjects(hitMeshes, false)[0]
    if (pin) return onPick(pin.object.userData.siteId)
    const cell = cellUnderPointer()
    if (cell !== null) onPin(cell)
  }
  const onLeave = () => {
    controls.enableZoom = false
    dragging = false
    hoverEvent = null
    if (hoverCell !== null) {
      hoverCell = null
      onProbe(null)
    }
  }
  controls.enableZoom = false
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointerleave', onLeave)

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
    if (hoverEvent) {
      pointerRay(hoverEvent)
      hoverEvent = null
      const cell = cellUnderPointer()
      if (cell !== hoverCell) {
        hoverCell = cell
        onProbe(cell)
      }
    }
    updateSky()
    renderer.render(scene, camera)
  })

  return {
    /** The canvas behind the ground texture: paint on it (groundTexture.js), then call refreshTexture(). */
    textureCanvas: canvas,
    refreshTexture() {
      texture.needsUpdate = true
    },
    setExaggeration(value) {
      exaggeration = value
      capPositions(terrain, exaggeration, positions)
      capGeometry.attributes.position.needsUpdate = true
      capGeometry.computeBoundingSphere()
      buildMarkers()
      updateFocus()
      placeReticle()
    },
    /** sites: [{ id, shortName, lat, lon, level, selectedLabels }] */
    setSites(list) {
      sites = list
      buildMarkers()
    },
    /** One entry of /api/sky (or null while it loads): where the Sun and the Earth are. */
    setSample(value) {
      sample = value
      sky.visible = !!sample
      if (sample) {
        sunLight.position.fromArray(sunDirection(sample))
        // The made-up Earth turns once a day, like the real one.
        earth.rotation.z = ((Date.parse(sample.t) / 3600000) % 24) * 15 * RAD
      }
      updateFocus()
    },
    /** The site the lines to the Sun and the Earth start from: { lat, lon, sunVisible, earthVisible } or null. */
    setFocus(value) {
      focus = value
      updateFocus()
    },
    /** Cell marked by the reticle (or null). */
    setReticle(cell) {
      reticleCell = cell
      placeReticle()
    },
    resetView,
    dispose() {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      clearMarkers()
      disposeTree(scene)
      texture.dispose()
      moonTexture.dispose()
      controls.dispose()
      renderer.dispose()
      el.remove()
    },
  }
}
