// The 2D map of the south pole: the "Top view" without the globe. A flat ground seen straight from above through an orthographic camera,
// lon 0 at the top and 90 E to the right (same plane as polarMap.js): no sphere, no stars, no relief mesh, so it draws in a fraction of the
// time of the 3D scene and loads nothing of it. It offers the same interface as createPolarSkyScene (polarSkyScene.js) for the part
// PolarSky.jsx drives, so the layers, the imagery tiles, the fine zone, the probe card, the pins and the best areas work unchanged:
//   - the ground is the same material (capMaterial.js) on a flat square, the fine zone (zoneMaterial.js) a flat square over it;
//   - the camera only zooms (wheel, double click, the site buttons) and pans, smoothly, inside the map: no orbit, no tilt;
//   - the graticule is drawn on a canvas over the view at the pixels of the screen (mapGrid.js paintScreenGrid): thin lines, values of a
//     constant size, nothing deformed, and no texture to upload while zooming.
import * as THREE from 'three'
import { createCapMaterial } from './capMaterial.js'
import { latLonOfMapPoint, overviewCell } from './hoverCell.js'
import { paintScreenGrid } from './mapGrid.js'
import { MAP_RADIUS_KM, polarRadiusKm } from './polarMap.js'
import { MOON_RADIUS_KM } from './polarSky.js'
import { unitVector } from './sky.js'
import { levelColor, makeLabel, selectionColor } from './terrainScene.js'
import { sameWindow, windowFor } from './tileGrid.js'
import { createZoneMaterial } from './zoneMaterial.js'

const RAD = Math.PI / 180
const MAP_KM = 2 * MAP_RADIUS_KM
const FOV_DEG = 50 // the 3D camera's: the height seen is turned into the "distance" the window and the chunks reason with
const MIN_VIEW_KM = 2.5 // the smallest height of the map seen
const NEAR_VIEW_KM = 45 // zoomed in this far on the selected site, its fine zone is shown (and left again beyond FAR_VIEW_KM)
const FAR_VIEW_KM = 70
const ZOOM_SMOOTHING_S = 0.1 // time constant of the smooth zoom and pan
const IDLE_RENDER_MS = 250
const CLICK_PX = 5
const PIN_HIT_PX = 14

/** Creates the 2D map inside `container`. Callbacks and returned methods: see createPolarSkyScene; `regions` and `gridColors` for the graticule. */
export function createMapScene(container, terrain, { onPick, onProbe, locateCell, onPin, onNear, onView, onWindow, regions = [], gridColors }) {
  const N = terrain.grid
  let sites = []
  let focus = null // { lat, lon, ... }: the site the zone belongs to
  let ranked = []
  let zone = null
  let zoneShown = false
  let near = false
  let dirty = true
  let lastRenderAt = 0
  const invalidate = () => {
    dirty = true
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  const el = renderer.domElement
  el.style.cursor = 'grab'
  container.appendChild(el)
  const gridCanvas = document.createElement('canvas')
  gridCanvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none'
  container.appendChild(gridCanvas)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000)
  camera.position.set(0, 0, 500)

  // --- The view: the center and the height (km) of the map seen; `target` is where the smooth move goes.
  let width = 1
  let height = 1
  let aspect = 1
  const fitHeight = () => MAP_KM * 1.04 * Math.max(1, 1 / aspect) // the whole map, a little margin
  const view = { cx: 0, cy: 0, h: MAP_KM * 1.04 }
  const target = { ...view }
  const unitsPerPixel = (v = view) => v.h / height
  const screenToMap = (px, py, v = view) => {
    const upp = unitsPerPixel(v)
    return { x: v.cx + (px - width / 2) * upp, y: v.cy - (py - height / 2) * upp }
  }
  const mapToScreen = (x, y) => {
    const upp = unitsPerPixel()
    return { x: (x - view.cx) / upp + width / 2, y: height / 2 - (y - view.cy) / upp }
  }
  function clampTarget() {
    target.h = Math.min(Math.max(target.h, MIN_VIEW_KM), fitHeight())
    const limit = MAP_KM / 2
    target.cx = Math.min(Math.max(target.cx, -limit), limit)
    target.cy = Math.min(Math.max(target.cy, -limit), limit)
  }
  function applyCamera() {
    const halfH = view.h / 2
    const halfW = halfH * aspect
    camera.left = -halfW
    camera.right = halfW
    camera.top = halfH
    camera.bottom = -halfH
    camera.position.set(view.cx, view.cy, 500)
    camera.updateProjectionMatrix()
  }
  const resize = () => {
    width = Math.max(container.clientWidth, 1)
    height = Math.max(container.clientHeight, 1)
    aspect = width / height
    renderer.setSize(width, height, false)
    el.style.width = '100%'
    el.style.height = '100%'
    const dpr = renderer.getPixelRatio()
    gridCanvas.width = Math.round(width * dpr)
    gridCanvas.height = Math.round(height * dpr)
    clampTarget()
    invalidate()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()
  view.h = target.h = fitHeight()

  // --- Ground: the same material as the 3D cap, on a flat square (its uv are the map: u to the east, v toward lon 0).
  const ground = createCapMaterial(renderer, terrain, renderer.capabilities.getMaxAnisotropy())
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP_KM, MAP_KM), ground.material)
  groundMesh.frustumCulled = false
  scene.add(groundMesh)
  // The fine zone: a flat square over the ground where it is.
  const zoneGround = createZoneMaterial(renderer.capabilities.getMaxAnisotropy())
  let zoneMesh = null
  function buildZoneMesh() {
    if (zoneMesh) {
      scene.remove(zoneMesh)
      zoneMesh.geometry.dispose()
      zoneMesh = null
    }
    if (!zone) return
    zoneMesh = new THREE.Mesh(new THREE.PlaneGeometry(zone.sizeKm, zone.sizeKm), zoneGround.material)
    zoneMesh.position.set(zone.centerXKm, zone.centerYKm, 0.3)
    zoneMesh.frustumCulled = false
    zoneMesh.visible = zoneShown
    scene.add(zoneMesh)
  }

  // --- Pins, drawn at a constant size on the screen (their geometry is in pixels, the group is scaled by km per pixel).
  const markers = new THREE.Group()
  const rankMarkers = new THREE.Group()
  scene.add(markers, rankMarkers)
  const mapXY = (lat, lon) => {
    const rho = polarRadiusKm(lat)
    return { x: rho * Math.sin(lon * RAD), y: rho * Math.cos(lon * RAD) }
  }
  const clearGroup = (group) => {
    for (const obj of [...group.children]) {
      group.remove(obj)
      obj.traverse((o) => {
        o.geometry?.dispose()
        o.material?.map?.dispose()
        o.material?.dispose()
      })
    }
  }
  const disc = (radius, color, order) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 28), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }))
    mesh.renderOrder = order
    return mesh
  }
  const ring = (inner, outer, color, order) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 36), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }))
    mesh.renderOrder = order
    return mesh
  }
  function buildMarkers() {
    clearGroup(markers)
    for (const s of sites) {
      const group = new THREE.Group()
      const { x, y } = mapXY(s.lat, s.lon)
      group.position.set(x, y, 1)
      group.userData.siteId = s.id
      group.add(disc(8.5, 0xffffff, 6), disc(6.5, levelColor(s.level), 7))
      if (s.selectedLabels.length) group.add(ring(11, 12.6, selectionColor(), 7))
      const label = makeLabel(s.selectedLabels.length ? `${s.shortName} (${s.selectedLabels.join(', ')})` : s.shortName)
      label.scale.set(101, 19, 1)
      label.position.set(0, 24, 0)
      group.add(label)
      markers.add(group)
    }
    lastScale = -1
    invalidate()
  }
  function buildRankMarkers() {
    clearGroup(rankMarkers)
    ranked.forEach((a, i) => {
      const group = new THREE.Group()
      const { x, y } = mapXY(a.lat, a.lon)
      group.position.set(x, y, 1.2)
      group.add(ring(13, 16, 0x39ff14, 8))
      const label = makeLabel(`#${i + 1}`)
      label.scale.set(60, 11, 1)
      label.position.set(0, 27, 0)
      group.add(label)
      rankMarkers.add(group)
    })
    lastScale = -1
    invalidate()
  }
  let lastScale = -1
  function scaleMarkers() {
    const upp = unitsPerPixel()
    if (Math.abs(upp - lastScale) < lastScale * 0.002) return
    lastScale = upp
    for (const g of [...markers.children, ...rankMarkers.children]) g.scale.setScalar(upp)
  }

  // --- The cursor: a square frame the size of the cell under the pointer (never smaller than 22 px), and a dot at its center.
  const reticle = new THREE.Group()
  {
    const frame = (outer, inner) => {
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
      return new THREE.ShapeGeometry(shape)
    }
    const draw = (geometry, color, order) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, side: THREE.DoubleSide }))
      mesh.renderOrder = order
      reticle.add(mesh)
    }
    draw(frame(0.57, 0.5), 0x000000, 8)
    draw(frame(0.5, 0.46), 0xffffff, 9)
    draw(new THREE.PlaneGeometry(0.2, 0.2), 0x000000, 8)
    draw(new THREE.PlaneGeometry(0.13, 0.13), 0xffffff, 9)
  }
  reticle.visible = false
  scene.add(reticle)
  let reticleInfo = null
  function placeReticle() {
    reticle.visible = reticleInfo !== null
    if (reticleInfo === null) return
    reticle.position.set(reticleInfo.cx, reticleInfo.cy, 2)
    reticle.scale.setScalar(Math.max(reticleInfo.sizeKm, 22 * unitsPerPixel()))
    invalidate()
  }

  // --- The pointer.
  let dragging = null // { x, y, moved }
  let hoverPoint = null
  let hoverInfo = null
  const pointer = (e) => {
    const rect = el.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function zoomAt(px, py, factor) {
    const before = screenToMap(px, py, target)
    target.h *= factor
    clampTarget()
    const after = screenToMap(px, py, target)
    target.cx += before.x - after.x
    target.cy += before.y - after.y
    clampTarget()
    invalidate()
  }
  const onWheel = (e) => {
    e.preventDefault()
    const p = pointer(e)
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
    zoomAt(p.x, p.y, Math.exp(dy * 0.0016))
  }
  let clickTimer = null
  const onDblClick = (e) => {
    clearTimeout(clickTimer)
    const p = pointer(e)
    zoomAt(p.x, p.y, 0.4)
  }
  const onDown = (e) => {
    const p = pointer(e)
    dragging = { x: p.x, y: p.y, startX: p.x, startY: p.y, moved: false }
    el.style.cursor = 'grabbing'
    el.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    const p = pointer(e)
    if (dragging) {
      if (Math.hypot(p.x - dragging.startX, p.y - dragging.startY) > CLICK_PX) dragging.moved = true
      if (dragging.moved) {
        const upp = unitsPerPixel(target)
        target.cx -= (p.x - dragging.x) * upp
        target.cy += (p.y - dragging.y) * upp
        clampTarget()
        view.cx = target.cx // the map follows the hand at once
        view.cy = target.cy
        invalidate()
      }
      dragging.x = p.x
      dragging.y = p.y
    } else {
      hoverPoint = p
      invalidate()
    }
  }
  const siteAt = (p) => {
    let best = null
    let bestDistance = PIN_HIT_PX
    for (const g of markers.children) {
      const s = mapToScreen(g.position.x, g.position.y)
      const d = Math.hypot(s.x - p.x, s.y - p.y)
      if (d < bestDistance) {
        bestDistance = d
        best = g.userData.siteId
      }
    }
    return best
  }
  const overviewIndexAt = (x, y) => {
    if (Math.hypot(x, y) > MAP_RADIUS_KM) return null
    const gx = Math.floor((x / MAP_KM + 0.5) * N)
    const gy = Math.floor((0.5 - y / MAP_KM) * N)
    return gx < 0 || gy < 0 || gx >= N || gy >= N ? null : gy * N + gx
  }
  const onUp = (e) => {
    const was = dragging
    dragging = null
    el.style.cursor = 'grab'
    if (!was || was.moved) return
    const p = pointer(e)
    const id = siteAt(p)
    if (id) return onPick(id)
    const { x, y } = screenToMap(p.x, p.y)
    const index = overviewIndexAt(x, y)
    if (index === null) return
    const { lat, lon } = latLonOfMapPoint(x, y)
    clearTimeout(clickTimer)
    clickTimer = setTimeout(() => onPin(index, unitVector(lat, lon).map((v) => v * MOON_RADIUS_KM)), 230)
  }
  const onLeave = () => {
    hoverPoint = null
    if (hoverInfo !== null) {
      hoverInfo = null
      reticleInfo = null
      placeReticle()
      onProbe(null)
    }
  }
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('dblclick', onDblClick)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointerleave', onLeave)

  // --- What the interface needs to know about the view, once it has settled.
  const distanceKm = () => Math.max(view.h, view.h * aspect) / (2 * Math.tan((FOV_DEG * RAD) / 2))
  let pendingWindow = null
  let pendingSince = 0
  let reportedWindow = null
  let reportedView = null
  function report(now, moving) {
    if (moving) return
    const wanted = windowFor(view.cx, view.cy, distanceKm(), FOV_DEG)
    if (!sameWindow(wanted, pendingWindow)) {
      pendingWindow = wanted
      pendingSince = now
    }
    if (!sameWindow(pendingWindow, reportedWindow) && now - pendingSince > 250) {
      reportedWindow = pendingWindow
      onWindow?.(reportedWindow)
    }
    const d = distanceKm()
    const last = reportedView
    if (!last || Math.hypot(view.cx - last.xKm, view.cy - last.yKm) > 3 || Math.abs(d - last.distanceKm) > 0.1 * last.distanceKm) {
      reportedView = { xKm: view.cx, yKm: view.cy, distanceKm: d, far: false }
      onView?.(reportedView)
    }
    updateNear()
  }
  function updateNear() {
    if (!focus) return
    const { x, y } = mapXY(focus.lat, focus.lon)
    const halfW = (view.h * aspect) / 2
    const inside = Math.abs(x - view.cx) < halfW && Math.abs(y - view.cy) < view.h / 2
    const next = near ? view.h < FAR_VIEW_KM && inside : view.h < NEAR_VIEW_KM && inside
    if (next !== near) {
      near = next
      onNear?.(near)
    }
  }

  // --- The loop: the smooth move, the hover, and a frame only when something changed.
  let lastFrame = performance.now()
  renderer.setAnimationLoop(() => {
    const now = performance.now()
    const dt = Math.min((now - lastFrame) / 1000, 0.05)
    lastFrame = now
    const k = 1 - Math.exp(-dt / ZOOM_SMOOTHING_S)
    const moving =
      Math.abs(target.cx - view.cx) > 0.0005 * view.h || Math.abs(target.cy - view.cy) > 0.0005 * view.h || Math.abs(Math.log(target.h / view.h)) > 0.0005
    if (moving) {
      view.cx += (target.cx - view.cx) * k
      view.cy += (target.cy - view.cy) * k
      view.h = Math.exp(Math.log(view.h) + (Math.log(target.h) - Math.log(view.h)) * k)
      dirty = true
    } else if (view.cx !== target.cx || view.cy !== target.cy || view.h !== target.h) {
      view.cx = target.cx
      view.cy = target.cy
      view.h = target.h
      dirty = true
    }
    if (hoverPoint && !dragging) {
      const { x, y } = screenToMap(hoverPoint.x, hoverPoint.y)
      const index = overviewIndexAt(x, y)
      const info = index === null ? null : locateCell ? locateCell(x, y, index) : { key: String(index), index, ...overviewCell(N, index) }
      if ((info?.key ?? null) !== (hoverInfo?.key ?? null)) {
        hoverInfo = info
        reticleInfo = info
        onProbe(info)
      }
      placeReticle()
    } else if (hoverPoint === null && reticleInfo) placeReticle()
    report(now, moving)
    if (!dirty && now - lastRenderAt < IDLE_RENDER_MS) return
    dirty = false
    lastRenderAt = now
    applyCamera()
    scaleMarkers()
    if (reticleInfo) reticle.scale.setScalar(Math.max(reticleInfo.sizeKm, 22 * unitsPerPixel()))
    renderer.render(scene, camera)
    paintScreenGrid(gridCanvas, { cx: view.cx, cy: view.cy, widthKm: view.h * aspect, heightKm: view.h }, { regions, colors: gridColors, dpr: renderer.getPixelRatio() })
  })

  const goTo = (cx, cy, h, animate = true) => {
    target.cx = cx
    target.cy = cy
    target.h = h
    clampTarget()
    if (!animate) Object.assign(view, target)
    invalidate()
  }

  const api = {
    /** The 2D map draws its graticule itself, over the view: the interface leaves the ground's grid texture empty. */
    screenGrid: true,
    ground,
    zoneGround,
    /** The relief setting (1 to 4): on a flat map it strengthens the relief shading (capMaterial.js setRelief). */
    setExaggeration(value) {
      ground.setRelief(value)
      zoneGround.setRelief(value)
    },
    setSample() {},
    setView() {}, // no standing on a site here: that is a 3D view
    lookAt() {},
    resetView() {
      goTo(0, 0, fitHeight())
    },
    /** 'top' is this map: the whole of it. The other poses belong to the 3D scene. */
    setOrbitPose(name, animate = true) {
      if (name === 'top') goTo(0, 0, fitHeight(), animate)
    },
    setSites(list) {
      sites = list
      buildMarkers()
    },
    setFocus(value) {
      focus = value
      updateNear()
      invalidate()
    },
    setRankMarkers(list) {
      ranked = list
      buildRankMarkers()
    },
    setZone(value, shown) {
      const changed = value !== zone
      zone = value
      zoneShown = !!(value && shown)
      if (changed) buildZoneMesh()
      else if (zoneMesh) zoneMesh.visible = zoneShown
      invalidate()
    },
    /** Zoom (smoothly) on a point of the map, as seen from `radiusKm` by the 3D camera. */
    flyTo(lat, lon, radiusKm = 60) {
      const { x, y } = mapXY(lat, lon)
      goTo(x, y, 0.93 * radiusKm)
    },
    /** Zoom on the selected site, close enough to see its fine zone. */
    zoomToSite() {
      if (!focus) return
      const { x, y } = mapXY(focus.lat, focus.lon)
      goTo(x, y, 22)
    },
    /** Zoom in or out by a factor, around the middle of the view (buttons). */
    zoomBy(factor) {
      zoomAt(width / 2, height / 2, factor)
    },
    /** Profiling aid (dev console, works in a hidden pane): ms per frame, waiting for the GPU, as in the 3D scene. */
    benchmark(frames = 20) {
      const gl = renderer.getContext()
      const px = new Uint8Array(4)
      applyCamera()
      const run = () => {
        renderer.render(scene, camera)
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
      }
      run()
      const t = performance.now()
      for (let i = 0; i < frames; i++) run()
      return { full: +((performance.now() - t) / frames).toFixed(2), size: [el.width, el.height] }
    },
    dispose() {
      renderer.setAnimationLoop(null)
      clearTimeout(clickTimer)
      observer.disconnect()
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('dblclick', onDblClick)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
      clearGroup(markers)
      clearGroup(rankMarkers)
      groundMesh.geometry.dispose()
      zoneMesh?.geometry.dispose()
      reticle.traverse((o) => {
        o.geometry?.dispose()
        o.material?.dispose()
      })
      ground.dispose()
      zoneGround.dispose()
      renderer.dispose()
      el.remove()
      gridCanvas.remove()
    },
  }
  // Any call from outside may change what is drawn: it asks for a frame (see the 3D scene).
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
