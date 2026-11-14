// Pictures drawn by code for the Polar sky view (no downloaded asset): a stylized Earth, the Sun's glare,
// the neutral Moon around the mapped cap, and the reticle of the hover probe. They are stylized on purpose:
// only the positions and angular sizes of the bodies are real.

// Value noise on a 3D lattice, so the Earth picture wraps around the sphere without a seam.
const hash = (x, y, z) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}
const smooth = (t) => t * t * (3 - 2 * t)
const mix = (a, b, t) => a + (b - a) * t
function noise(x, y, z) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const u = smooth(x - xi)
  const v = smooth(y - yi)
  const w = smooth(z - zi)
  const plane = (k) =>
    mix(mix(hash(xi, yi, zi + k), hash(xi + 1, yi, zi + k), u), mix(hash(xi, yi + 1, zi + k), hash(xi + 1, yi + 1, zi + k), u), v)
  return mix(plane(0), plane(1), w)
}
function fbm(x, y, z, octaves) {
  let sum = 0
  let amplitude = 0.5
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * noise(x, y, z)
    x *= 2.03
    y *= 2.03
    z *= 2.03
    amplitude *= 0.5
  }
  return sum
}
const step = (a, b, x) => smooth(Math.min(Math.max((x - a) / (b - a), 0), 1))

function newCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Equirectangular picture of a made-up Earth: oceans, some land, ice at the poles, soft clouds. */
export function makeEarthCanvas(width = 384, height = 192) {
  const canvas = newCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  for (let j = 0; j < height; j++) {
    const lat = (0.5 - (j + 0.5) / height) * Math.PI
    for (let i = 0; i < width; i++) {
      const lon = ((i + 0.5) / width) * 2 * Math.PI
      const x = Math.cos(lat) * Math.cos(lon)
      const y = Math.cos(lat) * Math.sin(lon)
      const z = Math.sin(lat)
      const land = step(0.5, 0.54, fbm(x * 2.1 + 5, y * 2.1 + 9, z * 2.1 + 2, 5))
      const dry = fbm(x * 4 + 20, y * 4, z * 4, 3)
      const ice = step(0.82, 0.9, Math.abs(z) + 0.12 * dry)
      const cloud = 0.85 * step(0.48, 0.68, fbm(x * 3.3 + 40, y * 3.3 + 40, z * 5 + 40, 5))
      let r = mix(18, mix(70, 150, dry), land)
      let g = mix(62, mix(120, 125, dry), land)
      let b = mix(140, mix(62, 85, dry), land)
      r = mix(mix(r, 235, ice), 255, cloud)
      g = mix(mix(g, 240, ice), 255, cloud)
      b = mix(mix(b, 245, ice), 255, cloud)
      const o = (j * width + i) * 4
      image.data[o] = r
      image.data[o + 1] = g
      image.data[o + 2] = b
      image.data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** The Sun's glare: a bright core, a soft halo and thin rays (a small star). Drawn for additive blending. */
export function makeSunGlowCanvas(size = 512) {
  const canvas = newCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const halo = ctx.createRadialGradient(c, c, 0, c, c, c)
  halo.addColorStop(0, 'rgba(255,255,255,1)')
  halo.addColorStop(0.05, 'rgba(255,252,240,0.95)')
  halo.addColorStop(0.12, 'rgba(255,240,205,0.42)')
  halo.addColorStop(0.35, 'rgba(255,220,160,0.1)')
  halo.addColorStop(1, 'rgba(255,220,160,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'lighter'
  ctx.translate(c, c)
  for (let k = 0; k < 6; k++) {
    const reach = c * (k % 3 === 0 ? 0.98 : 0.6)
    const ray = ctx.createLinearGradient(-reach, 0, reach, 0)
    ray.addColorStop(0, 'rgba(255,240,210,0)')
    ray.addColorStop(0.5, 'rgba(255,250,235,0.55)')
    ray.addColorStop(1, 'rgba(255,240,210,0)')
    ctx.fillStyle = ray
    ctx.fillRect(-reach, -1.2, 2 * reach, 2.4)
    ctx.rotate(Math.PI / 6)
  }
  return canvas
}

// Small seeded random generator, so the Moon is always the same.
function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Height profile of a crater at distance d (1 = rim): a smooth bowl, a sharp raised rim, a soft ejecta apron.
function craterProfile(d) {
  const bowl = d < 1 ? -(1 - d * d) * 0.9 : 0
  const rim = 0.55 * Math.exp(-(((d - 1) / 0.14) ** 2))
  const apron = d >= 1 ? 0.12 * Math.exp(-((d - 1) * 3)) : 0
  return bowl + rim + apron
}

let moonCache = null

/**
 * Picture of the whole Moon in an azimuthal equidistant projection centered on the south pole (distance from the pole
 * along the radius, north pole at the edge of the circle). Unlike an equirectangular map it does not pinch at the pole,
 * which is where the camera looks. See polarUv (polarSky.js) for the matching texture coordinates.
 * Classic look: bright cratered highlands, dark smooth maria, craters lit from the upper left, fine grain, warm gray.
 * Craters are splatted onto a height map (thousands, many small and a few large), then lit.
 * Made up, not LOLA data: it only says "this is the rest of the Moon". Built once, then reused.
 */
export function makeMoonCanvas(size = 1024) {
  if (moonCache) return moonCache
  const heights = new Float32Array(size * size)
  const albedo = new Float32Array(size * size)
  const dirs = new Float32Array(size * size * 3)
  const inside = new Uint8Array(size * size)
  const perRadian = size / (2 * Math.PI) // pixels per radian of distance from the pole

  // Direction of every pixel, then the albedo: dark seas, broad brightness patches, a little grain.
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const px = (2 * (i + 0.5)) / size - 1
      const py = (2 * (j + 0.5)) / size - 1
      const rho = Math.hypot(px, py)
      if (rho > 1) continue
      const theta = rho * Math.PI // angle from the south pole
      const phi = Math.atan2(py, px)
      const k = j * size + i
      const x = Math.sin(theta) * Math.cos(phi)
      const y = Math.sin(theta) * Math.sin(phi)
      const z = -Math.cos(theta)
      dirs[k * 3] = x
      dirs[k * 3 + 1] = y
      dirs[k * 3 + 2] = z
      inside[k] = 1
      const mare = step(0.5, 0.64, fbm(x * 1.5 + 11, y * 1.5 + 3, z * 1.5 + 7, 3))
      const patch = fbm(x * 5 + 2, y * 5 + 8, z * 5 + 4, 3) - 0.5
      albedo[k] = mix(0.6, 0.32, mare) + 0.16 * patch + 0.07 * (hash(i, j, 3) - 0.5)
    }
  }

  // Craters: radius from 3 pixels up to about 40, many small ones and a few large ones; depth in proportion to the radius.
  const random = mulberry32(20261114)
  for (let n = 0; n < 5500; n++) {
    const lat0 = Math.asin(random() * 2 - 1)
    const lon0 = random() * 2 * Math.PI
    const rPx = (3 * 14 ** (random() ** 2.6) * size) / 1024
    const r = rPx / perRadian
    const cx = Math.cos(lat0) * Math.cos(lon0)
    const cy = Math.cos(lat0) * Math.sin(lon0)
    const cz = Math.sin(lat0)
    const reach = 1.7 * r
    const cosReach = Math.cos(reach)
    // Where the crater lands in the picture, and how far it can reach there (tangential stretch of the projection).
    const theta0 = Math.acos(-cz)
    const stretch = Math.min(theta0 < 1e-3 ? 1 : theta0 / Math.sin(theta0), 8)
    const cxImg = (0.5 + (0.5 * (theta0 / Math.PI)) * (cx / Math.max(Math.sin(theta0), 1e-6))) * size
    const cyImg = (0.5 + (0.5 * (theta0 / Math.PI)) * (cy / Math.max(Math.sin(theta0), 1e-6))) * size
    const half = Math.ceil(reach * perRadian * stretch) + 1
    const i0 = Math.max(0, Math.floor(cxImg - half))
    const i1 = Math.min(size - 1, Math.ceil(cxImg + half))
    const j0 = Math.max(0, Math.floor(cyImg - half))
    const j1 = Math.min(size - 1, Math.ceil(cyImg + half))
    const depth = 0.35 * rPx
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * size + i
        if (!inside[k]) continue
        const dot = dirs[k * 3] * cx + dirs[k * 3 + 1] * cy + dirs[k * 3 + 2] * cz
        if (dot < cosReach) continue
        const d = Math.sqrt(2 * (1 - dot)) / r
        if (d <= 1.7) heights[k] += depth * craterProfile(d)
      }
    }
  }

  const canvas = newCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  const at = (i, j) => heights[Math.min(Math.max(j, 0), size - 1) * size + Math.min(Math.max(i, 0), size - 1)]
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i
      const o = k * 4
      image.data[o + 3] = 255
      if (!inside[k]) {
        image.data.fill(110, o, o + 3)
        continue
      }
      // Light from the upper left: surfaces rising toward the right or toward the south face it.
      const slope = at(i + 1, j) - at(i - 1, j) + (at(i, j + 1) - at(i, j - 1))
      const shade = Math.min(Math.max(slope * 0.45, -0.7), 0.7)
      const v = Math.min(Math.max(albedo[k] * (1 + shade), 0.04), 1) * 255
      image.data[o] = v
      image.data[o + 1] = v * 0.985
      image.data[o + 2] = v * 0.955
    }
  }
  ctx.putImageData(image, 0, 0)
  moonCache = canvas
  return canvas
}

/**
 * Generic starry sky (not the real constellations): [{ unit: Float32Array xyz, color: Float32Array rgb, count }] in
 * three layers, from many faint stars to a few bright ones. Always the same stars (seeded).
 */
export function makeStarField() {
  const layers = [
    { count: 2600, min: 0.3, max: 0.6 },
    { count: 700, min: 0.6, max: 0.9 },
    { count: 90, min: 0.9, max: 1 },
  ]
  let id = 0
  return layers.map(({ count, min, max }) => {
    const unit = new Float32Array(count * 3)
    const color = new Float32Array(count * 3)
    for (let k = 0; k < count; k++, id++) {
      const z = hash(id, 1, 2) * 2 - 1
      const lon = hash(id, 3, 4) * 2 * Math.PI
      const r = Math.sqrt(1 - z * z)
      unit.set([r * Math.cos(lon), r * Math.sin(lon), z], k * 3)
      const b = min + (max - min) * hash(id, 5, 6)
      const t = hash(id, 7, 8) // spectral tint: some blue-white, most white, some warm
      const tint = t < 0.2 ? [0.72, 0.82, 1] : t < 0.7 ? [1, 0.98, 0.95] : t < 0.9 ? [1, 0.9, 0.76] : [1, 0.76, 0.6]
      color.set([tint[0] * b, tint[1] * b, tint[2] * b], k * 3)
    }
    return { unit, color, count }
  })
}

/** A round soft star: bright core and a halo, for additive points. */
export function makeStarSpriteCanvas(size = 64) {
  const canvas = newCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return canvas
}

/**
 * Equirectangular picture of a faint Milky Way: a bright band along a tilted great circle, thickest toward a core,
 * broken by dark dust lanes, with a cool-to-warm tint. Very dark overall: it must not wash out the stars.
 */
export function makeMilkyWayCanvas(width = 768, height = 384) {
  const canvas = newCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  const normal = [0.28, -0.36, 0.89]
  const core = [0.62, 0.6, -0.5]
  const nl = Math.hypot(...normal)
  const cl = Math.hypot(...core)
  for (let j = 0; j < height; j++) {
    const lat = (0.5 - (j + 0.5) / height) * Math.PI
    for (let i = 0; i < width; i++) {
      const lon = ((i + 0.5) / width) * 2 * Math.PI
      const x = Math.cos(lat) * Math.cos(lon)
      const y = Math.cos(lat) * Math.sin(lon)
      const z = Math.sin(lat)
      const s = (x * normal[0] + y * normal[1] + z * normal[2]) / nl // 0 on the band
      const toCore = (x * core[0] + y * core[1] + z * core[2]) / cl
      const band = Math.exp(-((s / 0.16) ** 2)) * (0.55 + 0.45 * Math.max(toCore, 0))
      const cloud = 0.35 + 1.3 * fbm(x * 5 + 3, y * 5 + 6, z * 5 + 9, 5)
      const dust = 1 - 0.75 * step(0.52, 0.66, fbm(x * 9 + 40, y * 9 + 40, z * 9 + 40, 4)) * Math.exp(-((s / 0.12) ** 2))
      const v = Math.min(band * cloud * dust, 1.2)
      const o = (j * width + i) * 4
      image.data[o] = 78 * v
      image.data[o + 1] = 74 * v
      image.data[o + 2] = 92 * v
      image.data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Reticle of the hover probe: a ring with four ticks, as on a targeting display. */
export function makeReticleCanvas(size = 128) {
  const canvas = newCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const draw = (color, lineWidth) => {
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.arc(c, c, size * 0.3, 0, Math.PI * 2)
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2
      ctx.moveTo(c + Math.cos(a) * size * 0.16, c + Math.sin(a) * size * 0.16)
      ctx.lineTo(c + Math.cos(a) * size * 0.46, c + Math.sin(a) * size * 0.46)
    }
    ctx.stroke()
  }
  draw('rgba(0,0,0,0.85)', 9)
  draw('#ffffff', 4)
  return canvas
}

/** Fine grain for the ground of the site view (tiles in both directions). */
export function makeGrainCanvas(size = 256) {
  const canvas = newCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const x = i % size
    const y = Math.floor(i / size)
    const v = 150 + 90 * (fbm(x / 9, y / 9, 3, 4) - 0.47) + 50 * (hash(x, y, 1) - 0.5)
    image.data[i * 4] = v
    image.data[i * 4 + 1] = v
    image.data[i * 4 + 2] = v
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}
