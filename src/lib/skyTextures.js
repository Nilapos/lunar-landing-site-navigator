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

// Craters on the sphere: a jittered 3D lattice per scale, each cell may hold one crater with a bowl and a raised rim.
const CRATER_SCALES = [
  [3, 0.55, 10], // big basins
  [7, 0.4, 30],
  [16, 0.28, 50],
  [34, 0.2, 70], // small craters
]
function craterHeight(x, y, z) {
  let h = 0
  for (const [scale, amp, seed] of CRATER_SCALES) {
    const px = x * scale
    const py = y * scale
    const pz = z * scale
    const cx = Math.floor(px)
    const cy = Math.floor(py)
    const cz = Math.floor(pz)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const ix = cx + dx
          const iy = cy + dy
          const iz = cz + dz
          if (hash(ix, iy, iz + seed) < 0.55) continue
          const ox = ix + hash(ix, iy, iz + seed + 1)
          const oy = iy + hash(ix, iy, iz + seed + 2)
          const oz = iz + hash(ix, iy, iz + seed + 3)
          const radius = 0.16 + 0.3 * hash(ix, iy, iz + seed + 4)
          const d = Math.hypot(px - ox, py - oy, pz - oz) / radius
          if (d > 1.6) continue
          h += amp * ((d < 1 ? -(1 - d * d) : 0) + 0.5 * Math.exp(-(((d - 1) / 0.2) ** 2)))
        }
      }
    }
  }
  return h
}

/**
 * Equirectangular picture for the Moon outside the mapped cap: a pixel-art Moon with fine squares (0.67 degrees),
 * darker maria, craters with lit rims and shaded floors, in 24 gray levels with a faint cool tint. Draw it with
 * nearest-neighbor filtering. Made up, not LOLA data: it only says "this is the rest of the Moon".
 */
export function makeMoonCanvas(width = 540, height = 270) {
  const canvas = newCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  const light = [0.6, -0.5, 0.62] // light from the upper left, in lattice units
  const eps = 0.012
  for (let j = 0; j < height; j++) {
    const lat = (0.5 - (j + 0.5) / height) * Math.PI
    for (let i = 0; i < width; i++) {
      const lon = ((i + 0.5) / width) * 2 * Math.PI
      const x = Math.cos(lat) * Math.cos(lon)
      const y = Math.cos(lat) * Math.sin(lon)
      const z = Math.sin(lat)
      const mare = step(0.5, 0.62, fbm(x * 1.6 + 11, y * 1.6 + 3, z * 1.6 + 7, 4)) // large dark seas
      const dust = fbm(x * 9 + 2, y * 9 + 8, z * 9 + 4, 4) - 0.5
      const slope = (craterHeight(x + light[0] * eps, y + light[1] * eps, z + light[2] * eps) - craterHeight(x, y, z)) / eps
      const base = mix(176, 96, mare) + 70 * dust
      const v = Math.min(Math.max(Math.round((base - 26 * slope) / 9) * 9, 40), 245)
      const o = (j * width + i) * 4
      image.data[o] = v
      image.data[o + 1] = v + 1
      image.data[o + 2] = v + 5
      image.data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Direction (unit vectors) and brightness of `count` stars, always the same ones (seeded): [x, y, z, brightness, ...]. */
export function makeStarField(count = 1800) {
  const out = new Float32Array(count * 4)
  for (let k = 0; k < count; k++) {
    // Uniform on the sphere.
    const z = hash(k, 1, 2) * 2 - 1
    const lon = hash(k, 3, 4) * 2 * Math.PI
    const r = Math.sqrt(1 - z * z)
    out.set([r * Math.cos(lon), r * Math.sin(lon), z, 0.35 + 0.65 * hash(k, 5, 6) ** 3], k * 4)
  }
  return out
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
