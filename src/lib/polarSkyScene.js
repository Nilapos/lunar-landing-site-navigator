// The "Polar sky" scene (three.js): the south polar cap on the real sphere, with the Sun and the Earth in the sky
// at their true direction and angular size. The geometry and wording live in polarSky.js (tested); this file
// only draws. Frame: Moon-fixed, kilometers, z north, so "up" at the south pole is -z.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { cssToken } from './cssTokens.js'
import { createCapMaterial } from './capMaterial.js'
import { latLonOfMapPoint, overviewCell, reticleSideKm } from './hoverCell.js'
import { FULL_WINDOW, sameWindow, windowFor } from './tileGrid.js'
import { createZoneMaterial } from './zoneMaterial.js'
import {
  capIndices,
  capPositions,
  capRadii,
  EARTH_RADIUS_KM,
  earthPosition,
  groundRings,
  polarUv,
  horizonDirection,
  MOON_RADIUS_KM,
  placeBody,
  SUN_ANGULAR_RADIUS_DEG,
  sunDirection,
  mapXY,
  pickCap,
  southPolarUv,
  SOUTH_MOSAIC_WIDTH_M,
  surfacePoint,
} from './polarSky.js'
import { azEl, localFrame, unitVector } from './sky.js'
import { zoneHeightAt, zoneIndices, zonePositions } from './zones.js'
import { makeEarthCanvas, makeGrainCanvas, makeMilkyWayCanvas, makeMoonCanvas, makeStarField, makeStarSpriteCanvas, makeSunGlowCanvas } from './skyTextures.js'
import { levelColor, makeLabel, selectionColor } from './terrainScene.js'

const IDLE_RENDER_MS = 250 // a still scene is redrawn only this often (a safety net: every change asks for a frame by itself)
const MIN_PIXEL_RATIO = 0.75
const FAR_KM = 3000 // beyond this distance from its target the camera sees the Moon as a globe: no fine data to load
const SEAM_DEG = 33 // the two Moon photos meet 33 degrees from the south pole (latitude -57)
const RAD = Math.PI / 180
const DISPLAY_KM = 40000 // the bodies are drawn this far from the camera (true direction, true angular size)
const SUN_GLOW_DEG = 11 // width of the glare picture; the disc inside it keeps the Sun's true size
const SUN_COLOR = 0xffd166
const EARTH_COLOR = 0x6e8cff
const SOUTH = new THREE.Vector3(0, 0, -1)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const ORBIT_FOV = 50
const SITE_FOV = 60
const EYE_KM = 0.002 // the observer of the site view stands 2 m above the ground
const SKYLINE_KM = 100 // the horizon silhouette is drawn this far from the observer (only its direction matters)
const GROUND_LIT = 0xbdb8ae
const GROUND_SHADOW = 0x3a3c45

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

// The south polar mosaic (public/moon-wac-south-2048.jpg, polar stereographic, 1070.2 m per pixel) as a canvas whose alpha fades
// from opaque, 7 degrees inside the seam, to transparent at the seam, 33 degrees from the pole.
function fadedPolarCanvas(image) {
  const size = image.width
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, size, size)
  const pixelsPerKm = size / (SOUTH_MOSAIC_WIDTH_M / 1000)
  const radiusPx = (deg) => 2 * MOON_RADIUS_KM * Math.tan((deg * RAD) / 2) * pixelsPerKm
  const c = size / 2
  const inner = radiusPx(SEAM_DEG - 7) / radiusPx(SEAM_DEG)
  const mask = ctx.createRadialGradient(c, c, 0, c, c, radiusPx(SEAM_DEG))
  mask.addColorStop(0, 'rgba(0,0,0,1)')
  mask.addColorStop(inner, 'rgba(0,0,0,1)')
  mask.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = mask
  ctx.fillRect(0, 0, size, size)
  return canvas
}

/**
 * Creates the scene inside `container`. Callbacks: onPick(siteId) for a click on a pin, onProbe(cell | null), where a cell is what
 * locateCell(xKm, yKm, overviewIndex) returns for the pointer (the finest cell there is data for, see hoverCell.js; the 2.4 km cell when
 * locateCell is not given): { key, cx, cy, sizeKm, ... }; the cursor frames it,
 * when the pointer moves over the ground, onPin(cell) for a click on the ground.
 */
export function createPolarSkyScene(container, terrain, { onPick, onProbe, locateCell, onPin, onNear, onView, onWindow }) {
  const N = terrain.grid
  let exaggeration = 1 // true scale
  let sites = []
  let sample = null
  let view = null // { frame, yaw, pitch } when the camera stands on a site, null in orbit
  let savedOrbit = null
  let focus = null // { lat, lon, sunVisible, earthVisible }: the site the lines start from

  // Frames are drawn on demand: while the camera moves, a flight runs or something changed (every call from outside, see the end of
  // this function), not 60 times a second for a still picture. A canvas that does not change also lets the browser keep the blurred
  // or translucent panels laid over it as they are.
  let dirty = true
  let lastRenderAt = 0
  const invalidate = () => {
    dirty = true
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)) // beyond that the fill rate costs more than the sharpness shows
  container.appendChild(renderer.domElement)
  const el = renderer.domElement
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  const camera = new THREE.PerspectiveCamera(50, 1, 2, 120000)
  camera.up.copy(SOUTH) // must be set before the controls are created
  const controls = new OrbitControls(camera, el)
  controls.enableDamping = true
  controls.minDistance = 10
  controls.maxDistance = 9000
  controls.maxPolarAngle = Math.PI * 0.47
  controls.addEventListener('change', invalidate) // any move of the camera, damping included

  // Camera poses around the pole, as spherical coordinates around a target: radius, polar angle from the vertical of the
  // pole (0 = straight above), azimuth. "orbit" looks over the pole toward lon 0 where the Earth hangs; "top" looks straight
  // down on the cap with lon 0 at the top of the screen, like a map. A move between two poses is animated.
  const poseOf = (position, target) => {
    const ox = position.x - target.x
    const oy = position.y - target.y
    const up = -(position.z - target.z) // the vertical of the pole points toward -z
    return {
      target: target.toArray(),
      radius: Math.hypot(ox, oy, up),
      polar: Math.atan2(Math.hypot(ox, oy), up),
      azimuth: Math.atan2(oy, ox),
    }
  }
  const POSES = {
    orbit: poseOf(new THREE.Vector3(-700, 0, -(MOON_RADIUS_KM + 300)), new THREE.Vector3(350, 0, -MOON_RADIUS_KM)),
    top: { target: [0, 0, -MOON_RADIUS_KM], radius: 820, polar: 0.035, azimuth: Math.PI },
    // The whole Moon at true size, seen from the near side from a southern latitude (the pole tilted toward us), like the globe of NASA's videos.
    globe: { target: [0, 0, 0], radius: 5600, polar: 0.8, azimuth: 0 },
  }
  let poseName = 'orbit'
  let tween = null
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  function applyPose({ target, radius, polar, azimuth }) {
    const horizontal = radius * Math.sin(polar)
    const up = radius * Math.cos(polar)
    controls.target.set(target[0], target[1], target[2])
    camera.position.set(target[0] + horizontal * Math.cos(azimuth), target[1] + horizontal * Math.sin(azimuth), target[2] - up)
    controls.update()
  }
  function goToPose(nameOrPose, animate = true) {
    const to = typeof nameOrPose === 'string' ? POSES[nameOrPose] : nameOrPose
    if (typeof nameOrPose === 'string') poseName = nameOrPose
    if (!animate || reducedMotion()) {
      tween = null
      applyPose(to)
      return
    }
    const from = poseOf(camera.position, controls.target)
    const turn = ((((to.azimuth - from.azimuth + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI // shortest way round
    tween = { from, to, turn, start: performance.now(), duration: 1800 }
    controls.enabled = false
  }
  // One step of the animation: ease in and out, and pull back a little in the middle so the move feels like a flight.
  function stepTween(now) {
    if (!tween) return
    const k = Math.min((now - tween.start) / tween.duration, 1)
    const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
    const mix = (a, b) => a + (b - a) * e
    const { from, to } = tween
    applyPose({
      target: [mix(from.target[0], to.target[0]), mix(from.target[1], to.target[1]), mix(from.target[2], to.target[2])],
      radius: mix(from.radius, to.radius) + Math.sin(Math.PI * e) * 0.18 * Math.max(from.radius, to.radius),
      polar: mix(from.polar, to.polar),
      azimuth: from.azimuth + tween.turn * e,
    })
    if (k >= 1) {
      tween = null
      controls.enabled = view === null
    }
  }
  function resetView() {
    if (view) return lookAtBody('sun')
    goToPose(poseName)
  }
  applyPose(POSES.orbit)

  // The Sun lights the Earth and the Moon around the cap; the cap itself shows the painted layers.
  const sunLight = new THREE.DirectionalLight(0xffffff, 4.5)
  scene.add(sunLight)
  scene.add(new THREE.AmbientLight(0xffffff, 0.1)) // a little earthshine: the night side is dark, not invisible

  // --- Ground: the cap (its pictures are combined by the GPU, see capMaterial.js) and the smooth sphere around it.
  const ground = createCapMaterial(renderer, terrain, renderer.capabilities.getMaxAnisotropy())

  const positions = capPositions(terrain, exaggeration)
  let capBounds = capRadii(positions, N) // for pickCap: where a ray meets the cap
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
  const cap = new THREE.Mesh(capGeometry, ground.material)
  scene.add(cap)

  // A fine zone (100 to 250 m cells) around a site, shown in place of the overview when the camera comes close: its own
  // mesh and texture, and a hole in the overview (ground.setHole).
  let zone = null
  let zoneShown = false
  let zoneMesh = null
  const zoneGround = createZoneMaterial(renderer.capabilities.getMaxAnisotropy())
  function buildZoneMesh() {
    if (zoneMesh) {
      scene.remove(zoneMesh)
      zoneMesh.geometry.dispose()
      zoneMesh = null
    }
    if (!zone) return
    const n = zone.cells
    const uvs = new Float32Array(n * n * 2)
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) uvs.set([(i + 0.5) / n, 1 - (j + 0.5) / n], (j * n + i) * 2)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(zonePositions(zone, exaggeration), 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(new THREE.BufferAttribute(zoneIndices(n), 1))
    geometry.computeBoundingSphere()
    zoneMesh = new THREE.Mesh(geometry, zoneGround.material)
    zoneMesh.frustumCulled = false
    scene.add(zoneMesh)
  }
  // Position of a site on the surface that is shown (the zone's relief when it is, else the overview's).
  function sitePosition(lat, lon, liftKm = 0) {
    const h = zone && zoneShown ? zoneHeightAt(zone, lat, lon) : null
    if (h === null) return surfacePoint(terrain, lat, lon, exaggeration, liftKm)
    return unitVector(lat, lon).map((v) => v * (MOON_RADIUS_KM + (h / 1000) * exaggeration + liftKm))
  }
  let lastPinScale = -1
  let markersChanged = true // new pins have not been scaled yet
  let near = false
  let lastHit = null // the point of the cap under the pointer, as of the last cellUnderPointer()
  let reported = null

  // The rest of the Moon: a sphere open at the south (the cap covers the hole), just under the cap's rim.
  const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS_KM - 0.3, 144, 72, 0, Math.PI * 2, 0, Math.PI - 9.9 * RAD)
  moonGeometry.rotateX(Math.PI / 2) // the sphere's axis (y) becomes the polar axis (z)
  // The picture drawn by code is centered on the south pole (no pinching where the camera looks): it gets its own coordinates.
  {
    const pos = moonGeometry.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let k = 0; k < pos.count; k++) {
      const len = Math.hypot(pos.getX(k), pos.getY(k), pos.getZ(k))
      uv.set(polarUv(pos.getX(k) / len, pos.getY(k) / len, pos.getZ(k) / len), k * 2)
    }
    moonGeometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }
  const moonTexture = canvasTexture(makeMoonCanvas())
  moonTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  const moonMaterial = new THREE.MeshLambertMaterial({ map: moonTexture, emissive: 0xffffff, emissiveMap: moonTexture, emissiveIntensity: 0.55 })
  const moon = new THREE.Mesh(moonGeometry, moonMaterial)
  scene.add(moon)

  // The real Moon outside the polar cap, from the LRO WAC mosaics (NASA/GSFC/Arizona State University, via NASA Moon Trek): the
  // global mosaic (equirectangular, public/moon-wac-2048.jpg) for most of the sphere, and the south polar mosaic (polar
  // stereographic, public/moon-wac-south-2048.jpg) for the ring around the cap, where an equirectangular picture is stretched.
  // They replace the picture drawn by code once both are loaded; if a file is missing, the latter stays.
  let moonPhotos = []
  let moonPhotoMeshes = []
  let disposed = false
  const textureLoader = new THREE.TextureLoader()
  const loadPhoto = (url) => new Promise((resolve) => textureLoader.load(url, resolve, undefined, () => resolve(null)))
  Promise.all([loadPhoto('/moon-wac-2048.jpg'), loadPhoto('/moon-wac-south-2048.jpg')]).then(([globalPhoto, southPhoto]) => {
    if (disposed || !globalPhoto || !southPhoto) {
      globalPhoto?.dispose()
      southPhoto?.dispose()
      return
    }
    moonPhotos = [globalPhoto, southPhoto]
    for (const photo of moonPhotos) {
      photo.colorSpace = THREE.SRGBColorSpace
      photo.anisotropy = renderer.capabilities.getMaxAnisotropy()
    }
    // Lit by the real Sun (setSample): the phase and the terminator follow the timeline, the far side stays dark.
    const photoMaterial = (map, extra) => new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.08, ...extra })
    const radius = MOON_RADIUS_KM - 0.3
    // The global mosaic covers the whole sphere down to the cap (stretched near the pole, but hidden there); the polar mosaic is laid
    // over the ring around the cap and fades out toward the seam, so the two pictures, which are not normalized alike, blend
    // instead of meeting on a hard edge.
    const upper = new THREE.SphereGeometry(radius, 144, 72, 0, Math.PI * 2, 0, Math.PI - 9.9 * RAD) // the sphere's own equirectangular coordinates
    upper.rotateX(Math.PI / 2)
    const ring = new THREE.SphereGeometry(radius + 0.15, 144, 24, 0, Math.PI * 2, Math.PI - SEAM_DEG * RAD, (SEAM_DEG - 9.9) * RAD)
    ring.rotateX(Math.PI / 2)
    const pos = ring.attributes.position
    const uv = new Float32Array(pos.count * 2)
    for (let k = 0; k < pos.count; k++) {
      const { x, y } = mapXY([pos.getX(k), pos.getY(k), pos.getZ(k)])
      uv.set(southPolarUv(x, y), k * 2)
    }
    ring.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const fadedSouth = canvasTexture(fadedPolarCanvas(southPhoto.image))
    fadedSouth.anisotropy = renderer.capabilities.getMaxAnisotropy()
    moonPhotos.push(fadedSouth)
    const ringMesh = new THREE.Mesh(ring, photoMaterial(fadedSouth, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
    ringMesh.renderOrder = 1
    moonPhotoMeshes = [new THREE.Mesh(upper, photoMaterial(globalPhoto)), ringMesh]
    scene.add(...moonPhotoMeshes)
    moon.visible = false
    orbitParts.splice(orbitParts.indexOf(moon), 1)
    orbitParts.push(...moonPhotoMeshes)
    invalidate()
  })

  // Sky: a faint Milky Way and three layers of stars (many faint, some medium, a few bright and glowing), all at the
  // far limit so they never hide anything, and moved with the camera so they behave like a sky at infinity.
  const skyDome = new THREE.Group()
  const milkyWay = new THREE.Mesh(
    new THREE.SphereGeometry(98000, 48, 24),
    new THREE.MeshBasicMaterial({ map: canvasTexture(makeMilkyWayCanvas()), side: THREE.BackSide, depthWrite: false }),
  )
  milkyWay.renderOrder = 5 // after the Moon and the cap: its pixels behind them are rejected by the depth test, not shaded
  skyDome.add(milkyWay)
  const starSprite = canvasTexture(makeStarSpriteCanvas())
  const STAR_SIZES = [3, 4.4, 9]
  makeStarField().forEach(({ unit, color, count }, layer) => {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    for (let k = 0; k < count * 3; k++) positions[k] = unit[k] * 100000
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: STAR_SIZES[layer],
        sizeAttenuation: false,
        vertexColors: true,
        map: starSprite,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    points.frustumCulled = false
    points.renderOrder = -1
    skyDome.add(points)
  })
  scene.add(skyDome)

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
    const show = !!(focus && sample) && view === null
    groundMaterial.color.setHex(focus?.sunVisible ? GROUND_LIT : GROUND_SHADOW)
    sunLine.visible = show
    earthLine.visible = show
    if (!show) return
    focusPoint.fromArray(sitePosition(focus.lat, focus.lon, 1))
    // Yellow to the Sun and blue to the Earth while they are above the site's terrain horizon; red when the terrain hides them
    // (same test as the numbers in the score card, not a ray against the exaggerated relief).
    const hidden = levelColor('fail')
    sunLine.material.color.set(focus.sunVisible ? SUN_COLOR : hidden)
    earthLine.material.color.set(focus.earthVisible ? EARTH_COLOR : hidden)
    sunLine.material.opacity = focus.sunVisible ? 0.95 : 0.85
    earthLine.material.opacity = focus.earthVisible ? 0.95 : 0.85
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
    placeBodyLabel(sunLabel, sunDisc, sun.angularRadiusDeg)
    placeBodyLabel(earthLabel, earth, placed.angularRadiusDeg)
  }

  // --- Site pins, standing along the local vertical.
  const markers = new THREE.Group()
  scene.add(markers)

  // Numbered rings on the best areas found by the search (bestAreas.js), in neon green like the Optimal layer.
  const rankMarkers = new THREE.Group()
  scene.add(rankMarkers)
  let ranked = []
  function buildRankMarkers() {
    markersChanged = true
    for (const obj of [...rankMarkers.children]) {
      rankMarkers.remove(obj)
      disposeTree(obj)
    }
    ranked.forEach((a, i) => {
      const group = new THREE.Group()
      group.position.fromArray(surfacePoint(terrain, a.lat, a.lon, exaggeration))
      group.quaternion.setFromUnitVectors(Y_AXIS, group.position.clone().normalize())
      const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 1.2, 8, 40), new THREE.MeshBasicMaterial({ color: 0x39ff14 }))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 1
      const label = makeLabel(`#${i + 1}`)
      label.scale.multiplyScalar(0.7)
      label.position.y = 24
      group.add(ring, label)
      rankMarkers.add(group)
    })
  }
  const hitMeshes = []
  function clearMarkers() {
    markersChanged = true
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
      group.position.fromArray(sitePosition(s.lat, s.lon))
      group.quaternion.setFromUnitVectors(Y_AXIS, group.position.clone().normalize())
      const color = levelColor(s.level)
      const pinHeight = 16
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, pinHeight, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }))
      pin.position.y = pinHeight / 2
      const head = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 14), new THREE.MeshBasicMaterial({ color }))
      head.position.y = pinHeight + 2
      group.add(pin, head)
      if (s.selectedLabels.length) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.7, 8, 32), new THREE.MeshBasicMaterial({ color: selectionColor() }))
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
  // The cursor: a square frame the size of the cell under the pointer, lying on the ground (never smaller than 22 pixels on the screen, so
  // it can still be aimed at when the cell is tiny: it grows back to the true cell as the camera comes close), and a dot at its center.
  const reticle = new THREE.Group()
  {
    const ring = (outer, inner) => {
      const shape = new THREE.Shape()
      shape.moveTo(-outer, -outer)
      shape.lineTo(outer, -outer)
      shape.lineTo(outer, outer)
      shape.lineTo(-outer, outer)
      shape.closePath()
      const hole = new THREE.Path()
      hole.moveTo(-inner, -inner)
      hole.lineTo(-inner, inner)
      hole.lineTo(inner, inner)
      hole.lineTo(inner, -inner)
      hole.closePath()
      shape.holes.push(hole)
      return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2) // into the ground plane, normal up
    }
    const dot = (half) => new THREE.PlaneGeometry(2 * half, 2 * half).rotateX(-Math.PI / 2)
    const draw = (geometry, color, order) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, side: THREE.DoubleSide }))
      mesh.renderOrder = order
      reticle.add(mesh)
    }
    draw(ring(0.62, 0.5), 0x000000, 8) // dark halo around the frame, for contrast on bright ground
    draw(ring(0.5, 0.43), 0xffffff, 9)
    draw(dot(0.1), 0x000000, 8)
    draw(dot(0.065), 0xffffff, 9)
  }
  reticle.visible = false
  scene.add(reticle)
  let reticleInfo = null // the cell framed: { cx, cy, sizeKm } or null
  const reticleBasis = new THREE.Matrix4()
  const reticleX = new THREE.Vector3()
  const reticleUp = new THREE.Vector3()
  const reticleZ = new THREE.Vector3()
  function placeReticle() {
    reticle.visible = reticleInfo !== null && view === null
    if (reticleInfo === null) return
    const { lat, lon } = latLonOfMapPoint(reticleInfo.cx, reticleInfo.cy)
    reticleUp.fromArray(sitePosition(lat, lon, reticleInfo.sizeKm * 0.03))
    reticle.position.copy(reticleUp)
    reticleUp.normalize()
    // The frame follows the axes of the map (x east of the pole, y toward longitude 0: scene +y and +x), flattened on the ground there.
    reticleX.set(0, 1, 0).addScaledVector(reticleUp, -reticleUp.y).normalize()
    reticleZ.crossVectors(reticleX, reticleUp)
    reticle.quaternion.setFromRotationMatrix(reticleBasis.makeBasis(reticleX, reticleUp, reticleZ))
    updateReticleSize()
  }
  function updateReticleSize() {
    if (reticleInfo === null) return
    const side = reticleSideKm(reticleInfo.sizeKm, camera.position.distanceTo(reticle.position), camera.fov, container.clientHeight)
    reticle.scale.setScalar(side)
  }

  // --- Site view: the observer stands on the site and turns their head. The ground rises to the site's real
  // terrain horizon (360-value profile), so the Sun and the Earth pass above or behind the true skyline.
  const orbitParts = [cap, moon, markers]
  const siteGroup = new THREE.Group()
  siteGroup.visible = false
  scene.add(siteGroup)
  const grainTexture = canvasTexture(makeGrainCanvas())
  grainTexture.wrapS = THREE.RepeatWrapping
  grainTexture.wrapT = THREE.RepeatWrapping
  const groundMaterial = new THREE.MeshBasicMaterial({ map: grainTexture, vertexColors: true, side: THREE.DoubleSide })
  const sunLabel = makeLabel('Sun')
  const earthLabel = makeLabel('Earth')
  for (const label of [sunLabel, earthLabel]) {
    label.visible = false
    scene.add(label)
  }

  function clearSiteGroup() {
    for (const obj of [...siteGroup.children]) {
      siteGroup.remove(obj)
      obj.geometry?.dispose()
      if (obj.material !== groundMaterial) disposeTree(obj)
    }
  }
  function buildSiteGround(frame, profile) {
    clearSiteGroup()
    const RINGS = 5
    const SHADE = [0.62, 0.66, 0.58, 0.46, 0.4] // darker toward the skyline, so the relief reads as a silhouette
    const V = [0, 1.5, 3.5, 5, 5.3]
    const vertices = new Float32Array(361 * RINGS * 3)
    const colors = new Float32Array(361 * RINGS * 3)
    const uv = new Float32Array(361 * RINGS * 2)
    const skyline = new Float32Array(361 * 3)
    for (let az = 0; az <= 360; az++) {
      const rings = groundRings(profile[az % 360])
      for (let k = 0; k < RINGS; k++) {
        const i = az * RINGS + k
        const d = horizonDirection(frame, az, rings[k])
        vertices.set([d[0] * SKYLINE_KM, d[1] * SKYLINE_KM, d[2] * SKYLINE_KM], i * 3)
        colors.fill(SHADE[k], i * 3, i * 3 + 3)
        uv.set([az / 12, V[k]], i * 2)
      }
      skyline.set(vertices.subarray((az * RINGS + RINGS - 1) * 3, (az * RINGS + RINGS) * 3), az * 3)
    }
    const indices = []
    for (let az = 0; az < 360; az++) {
      for (let k = 0; k < RINGS - 1; k++) {
        const a = az * RINGS + k
        const b = a + RINGS
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    geometry.setIndex(indices)
    const ground = new THREE.Mesh(geometry, groundMaterial)
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(skyline, 3))
    const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: new THREE.Color(cssToken('--color-grid-line') || '#7480b8') }))
    siteGroup.add(ground, line)
    // Compass marks just above the skyline.
    for (const [text, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
      const mark = makeLabel(text)
      mark.scale.set(30, 5.6, 1)
      mark.position.fromArray(horizonDirection(frame, az, profile[az] - 3)).multiplyScalar(SKYLINE_KM * 0.9)
      siteGroup.add(mark)
    }
  }
  const forward = new THREE.Vector3()
  function aimSiteCamera() {
    view.pitch = Math.min(Math.max(view.pitch, -60), 85)
    forward.fromArray(horizonDirection(view.frame, view.yaw, view.pitch))
    camera.up.fromArray(view.frame.up)
    camera.lookAt(forward.add(camera.position))
  }
  function lookAtBody(body) {
    if (!view || !sample) return
    const cam = camera.position.toArray()
    const target = body === 'earth' ? { position: earthPosition(sample), radiusKm: EARTH_RADIUS_KM } : { direction: sunDirection(sample) }
    view.yaw = azEl(view.frame, placeBody(cam, target, 1).direction).az
    view.pitch = 7
    camera.fov = SITE_FOV
    camera.updateProjectionMatrix()
    aimSiteCamera()
  }
  function applyMode() {
    const site = view !== null
    for (const part of orbitParts) part.visible = !site
    siteGroup.visible = site
    controls.enabled = !site
    camera.near = site ? 0.5 : 2
    camera.fov = site ? SITE_FOV : ORBIT_FOV
    camera.updateProjectionMatrix()
    updateFocus()
    placeReticle()
  }
  // Puts a name above a body in the site view (also when the body is behind the terrain, to show where it is).
  function placeBodyLabel(label, body, angularRadiusDeg) {
    label.visible = view !== null
    if (!label.visible) return
    const zoom = camera.fov / SITE_FOV
    label.position.copy(body.position).addScaledVector(camera.up, DISPLAY_KM * Math.tan((angularRadiusDeg + 2.4 * zoom) * RAD))
    const width = DISPLAY_KM * Math.tan(20 * zoom * RAD)
    label.scale.set(width, width * 0.1875, 1)
  }

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  function pointerRay(e) {
    const rect = el.getBoundingClientRect()
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
  }
  // The cell (one vertex per cell) under the pointer, and the point of the cap there (lastHit). Not a raycast on the mesh: its
  // 130 000 triangles cost about 13 ms per test, at every pointer move; see pickCap.
  function cellUnderPointer() {
    const { origin, direction } = raycaster.ray
    const hit = pickCap(capBounds, origin.toArray(), direction.toArray())
    if (!hit) return null
    lastHit = hit.point
    return hit.index
  }

  let downAt = null
  let dragging = false
  let hoverEvent = null // the last pointer move, handled once per frame
  let hoverInfo = null // the cell under the pointer (see locateCell)
  const onDown = (e) => {
    invalidate()
    downAt = { x: e.clientX, y: e.clientY }
    dragging = true
    controls.enableZoom = true // the wheel only zooms after a click, so scrolling the page does not move the camera
  }
  const onMove = (e) => {
    if (view) {
      invalidate()
      // Site view: dragging turns the head (the sky follows the pointer).
      if (!dragging) return
      const degPerPixel = camera.fov / el.clientHeight
      view.yaw = (view.yaw - e.movementX * degPerPixel + 360) % 360
      view.pitch += e.movementY * degPerPixel
      aimSiteCamera()
    } else if (!dragging && e.pointerType !== 'touch') hoverEvent = e
  }
  // Site view: the wheel changes the field of view (after a click, like the orbit zoom).
  const onWheel = (e) => {
    if (!view || !controls.enableZoom) return
    invalidate()
    e.preventDefault()
    camera.fov = Math.min(Math.max(camera.fov * Math.exp(e.deltaY * 0.001), 6), 80)
    camera.updateProjectionMatrix()
  }
  const onUp = (e) => {
    dragging = false
    if (view || !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return
    pointerRay(e)
    const pin = raycaster.intersectObjects(hitMeshes, false)[0]
    if (pin) return onPick(pin.object.userData.siteId)
    const cell = cellUnderPointer()
    if (cell !== null) onPin(cell, lastHit)
  }
  const onLeave = () => {
    controls.enableZoom = false
    dragging = false
    hoverEvent = null
    if (hoverInfo !== null) {
      hoverInfo = null
      reticleInfo = null
      placeReticle()
      onProbe(null)
    }
  }
  controls.enableZoom = false
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointerleave', onLeave)
  el.addEventListener('wheel', onWheel, { passive: false })

  const resize = () => {
    const w = Math.max(container.clientWidth, 1)
    const h = Math.max(container.clientHeight, 1)
    renderer.setSize(w, h, false)
    el.style.width = '100%'
    el.style.height = '100%'
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    invalidate()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  // Adaptive resolution: while the picture is redrawn continuously (a drag, a flight, a play), if frames come slower than about
  // 40 per second the pixel ratio is lowered step by step (never back above the level that was too slow), and raised again slowly
  // when frames come fast. A weak graphics card then gets a slightly softer picture instead of a jerky one.
  let pixelRatio = renderer.getPixelRatio()
  let ceilingRatio = pixelRatio
  let frameAverage = 16.7
  let fastFrames = 0
  let lockUntil = 0
  function adaptResolution(now) {
    const dt = now - lastRenderAt
    if (dt > 60) return // a first frame after a pause says nothing about the speed
    frameAverage = frameAverage * 0.9 + dt * 0.1
    if (now < lockUntil) return
    let next = pixelRatio
    if (frameAverage > 26 && pixelRatio > MIN_PIXEL_RATIO) {
      ceilingRatio = Math.min(ceilingRatio, pixelRatio * 0.92)
      next = Math.max(MIN_PIXEL_RATIO, pixelRatio * 0.8)
      fastFrames = 0
      lockUntil = now + 800
    } else if (frameAverage < 17.5 && pixelRatio < ceilingRatio) {
      if (++fastFrames >= 120) {
        next = Math.min(ceilingRatio, pixelRatio * 1.1)
        fastFrames = 0
        lockUntil = now + 3000
      }
    } else fastFrames = 0
    if (next !== pixelRatio) {
      pixelRatio = next
      renderer.setPixelRatio(pixelRatio)
      resize()
      frameAverage = 16.7
    }
  }
  // The window of the map the grid and the detail are drawn for follows the camera (see tileGrid.js windowFor). It is reported once the
  // camera has kept the same window for a moment and no flight is running, so a flight does not load tiles it will not need.
  let pendingWindow = null
  let pendingSince = 0
  let reportedWindow = null
  function followWindow(now) {
    const distance = camera.position.distanceTo(controls.target)
    let wanted = FULL_WINDOW
    if (distance <= FAR_KM) {
      const { x, y } = mapXY(controls.target.toArray())
      wanted = windowFor(x, y, distance, camera.fov)
    }
    if (!sameWindow(wanted, pendingWindow)) {
      pendingWindow = wanted
      pendingSince = now
    }
    if (!tween && !sameWindow(pendingWindow, reportedWindow) && now - pendingSince > 250) {
      reportedWindow = pendingWindow
      onWindow(reportedWindow)
    }
  }
  renderer.setAnimationLoop(() => {
    const frameStart = performance.now()
    stepTween(frameStart)
    if (tween) dirty = true
    if (view === null && onWindow) followWindow(frameStart)
    if (!view) controls.update()
    if (hoverEvent) {
      pointerRay(hoverEvent)
      hoverEvent = null
      const index = cellUnderPointer()
      let info = null
      if (index !== null) {
        const { x, y } = mapXY(lastHit)
        info = locateCell ? locateCell(x, y, index) : { key: String(index), index, ...overviewCell(N, index) }
      }
      if ((info?.key ?? null) !== (hoverInfo?.key ?? null)) {
        hoverInfo = info
        reticleInfo = info
        placeReticle()
        onProbe(info)
      }
    }
    skyDome.position.copy(camera.position)
    // Pins shrink as the camera comes close, so they stay small marks on a fine zone.
    const pinScale = Math.min(1, Math.max(0.02, camera.position.distanceTo(controls.target) / 900))
    if (Math.abs(pinScale - lastPinScale) > 0.002 || markersChanged) {
      for (const pin of markers.children) pin.scale.setScalar(pinScale)
      for (const pin of rankMarkers.children) pin.scale.setScalar(pinScale)
      lastPinScale = pinScale
      markersChanged = false
    }
    rankMarkers.visible = view === null
    if (zoneMesh) zoneMesh.visible = zoneShown && view === null
    // Tell React where the camera looks (map plane) and from how far, when it changes enough: the 500 m chunks follow it.
    // Not during a flight (each report re-renders the interface), and from far away only one report: the chunks need no more.
    if (view === null && onView && !tween) {
      const distanceKm = camera.position.distanceTo(controls.target)
      const far = distanceKm > FAR_KM
      const here = mapXY(controls.target.toArray())
      const last = reported
      const moved = !last || Math.hypot(here.x - last.xKm, here.y - last.yKm) > 3 || Math.abs(distanceKm - last.distanceKm) > 0.1 * last.distanceKm
      if (far ? !last || !last.far : moved) {
        reported = { xKm: here.x, yKm: here.y, distanceKm, far }
        onView(reported)
      }
    }
    // Tell React when the camera is close enough to the selected site for its fine zone (with some hysteresis).
    if (focus && view === null) {
      const distance = camera.position.distanceTo(focusPoint)
      const next = near ? distance < 140 : distance < 90
      if (next !== near) {
        near = next
        onNear?.(near)
      }
    }
    if (!dirty && frameStart - lastRenderAt < IDLE_RENDER_MS) return
    dirty = false
    adaptResolution(frameStart)
    lastRenderAt = frameStart
    updateSky()
    if (reticle.visible) updateReticleSize()
    renderer.render(scene, camera)
  })

  const api = {
    /** The ground of the cap (capMaterial.js): its canvases are painted by groundTexture.js, its layer and hole are set here. */
    ground,
    setExaggeration(value) {
      exaggeration = value
      capPositions(terrain, exaggeration, positions)
      capBounds = capRadii(positions, N)
      if (zoneMesh) {
        zonePositions(zone, exaggeration, zoneMesh.geometry.attributes.position.array)
        zoneMesh.geometry.attributes.position.needsUpdate = true
      }
      capGeometry.attributes.position.needsUpdate = true
      capGeometry.computeBoundingSphere()
      buildMarkers()
      buildRankMarkers()
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
    /**
     * Camera: null = orbit above the cap; { lat, lon, profile } = standing on that site, with its terrain horizon
     * (360 values, one per degree of azimuth) as the skyline.
     */
    /** The ground of the fine zone (zoneMaterial.js): its canvases are drawn by tileWindow.js and mapGrid.js, its layer is set here. */
    zoneGround,
    /** The fine zone to draw (see zones.js) or null, and whether it is shown (the camera is close to it). */
    setZone(value, shown) {
      const changed = value !== zone
      zone = value
      const wasShown = zoneShown
      zoneShown = !!(value && shown)
      if (changed) buildZoneMesh()
      if (changed || wasShown !== zoneShown) {
        buildMarkers()
        updateFocus()
      }
    },
    /** The best areas to mark with numbered rings: [{ lat, lon }] (best first), or [] for none. */
    setRankMarkers(list) {
      ranked = list
      buildRankMarkers()
    },
    /** Fly the camera down above a point of the map. */
    flyTo(lat, lon, radiusKm = 60) {
      if (view) return
      goToPose({ target: surfacePoint(terrain, lat, lon, exaggeration), radius: radiusKm, polar: 0.8, azimuth: Math.PI })
    },
    /** Fly down to the selected site, close enough to see its fine zone. */
    zoomToSite() {
      if (!focus || view) return
      const target = sitePosition(focus.lat, focus.lon)
      goToPose({ target, radius: 26, polar: 0.75, azimuth: Math.PI })
    },
    /** Orbit camera pose: 'orbit' (oblique, over the pole) or 'top' (straight down). Animated unless animate is false. */
    setOrbitPose(name, animate = true) {
      poseName = name
      if (!view) goToPose(name, animate)
    },
    setView(site) {
      tween = null
      if (site) {
        const first = !view
        if (first) savedOrbit = { position: camera.position.clone(), target: controls.target.clone() }
        const frame = localFrame(site.lat, site.lon)
        view = { frame, yaw: view?.yaw ?? 0, pitch: view?.pitch ?? 7 }
        camera.position.fromArray(frame.up).multiplyScalar(MOON_RADIUS_KM + EYE_KM)
        siteGroup.position.copy(camera.position)
        buildSiteGround(frame, site.profile)
        applyMode()
        if (first && sample) lookAtBody('sun')
        else aimSiteCamera()
      } else if (view) {
        view = null
        clearSiteGroup()
        camera.up.copy(SOUTH)
        camera.position.copy(savedOrbit.position)
        controls.target.copy(savedOrbit.target)
        applyMode()
        controls.update()
      }
    },
    /** Site view: turn toward 'sun' or 'earth'. */
    lookAt: lookAtBody,
    resetView,
    /**
     * Profiling aid (works while the page is hidden, where the animation loop is paused): renders `frames` frames synchronously,
     * waiting for the GPU each time, and returns the average ms per frame for the whole scene and with one part left out at a time.
     */
    benchmark(frames = 20, pixelRatio = renderer.getPixelRatio()) {
      const originalRatio = renderer.getPixelRatio()
      renderer.setPixelRatio(pixelRatio)
      renderer.setSize(container.clientWidth, container.clientHeight, false)
      const gl = renderer.getContext()
      const px = new Uint8Array(4)
      const measure = () => {
        renderer.render(scene, camera)
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        const t = performance.now()
        for (let i = 0; i < frames; i++) {
          renderer.render(scene, camera)
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        }
        return +((performance.now() - t) / frames).toFixed(2)
      }
      const parts = { cap, sky, markers, skyDome, milkyWay, moon: { set visible(v) { for (const m of moonPhotoMeshes) m.visible = v } } }
      const result = { size: [el.width, el.height], pixelRatio: renderer.getPixelRatio(), full: measure(), without: {} }
      for (const [name, part] of Object.entries(parts)) {
        const was = name === 'moon' ? moonPhotoMeshes.map((m) => m.visible) : part.visible
        part.visible = false
        result.without[name] = measure()
        if (name === 'moon') moonPhotoMeshes.forEach((m, i) => (m.visible = was[i]))
        else part.visible = was
      }
      renderer.setPixelRatio(originalRatio)
      renderer.setSize(container.clientWidth, container.clientHeight, false)
      const t0 = performance.now()
      for (let i = 0; i < 20; i++) {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
        cellUnderPointer()
      }
      result.raycastMs = +((performance.now() - t0) / 20).toFixed(2)
      result.triangles = renderer.info.render.triangles
      result.drawCalls = renderer.info.render.calls
      return result
    },
    dispose() {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('wheel', onWheel)
      clearSiteGroup()
      groundMaterial.dispose()
      grainTexture.dispose()
      clearMarkers()
      disposeTree(scene)
      ground.dispose()
      zoneGround.dispose()
      moonTexture.dispose()
      disposed = true
      for (const photo of moonPhotos) photo.dispose()
      for (const mesh of moonPhotoMeshes) {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
      controls.dispose()
      renderer.dispose()
      el.remove()
    },
  }
  // Any call from outside (the interface, an effect) may change what is drawn: it asks for a frame.
  const askForFrames = (object) => {
    for (const key of Object.keys(object)) {
      const value = object[key]
      if (typeof value === 'function') {
        object[key] = (...args) => {
          invalidate()
          return value(...args)
        }
      }
    }
  }
  askForFrames(api)
  askForFrames(api.ground)
  return api
}
