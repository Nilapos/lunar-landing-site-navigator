// Draws a window of the map plane (see tileGrid.js) on a canvas from the tiles of NASA Moon Trek layers, loading them as needed.
//
// The picture is made of passes, one per source, bottom first: for each, a coarse pass (a few tiles, quick to arrive: no hole while
// the sharp ones load) then the pass at the level whose pixels match the canvas. A tile that is not there yet leaves what is under it.
// Tiles are fetched straight from trek.nasa.gov (public, CORS open) into a cache shared by all windows; the request queue serves the
// tiles in the middle of the window first and forgets the ones a newer window no longer needs.
import { TILE_PX, levelForPixelSize, pixelSizeM, tileUrl, tilesCovering, windowMeetsBox } from './tileGrid.js'

const CACHE_LIMIT = 480 // decoded tiles kept (about 120 MB at most)
const MAX_ACTIVE = 8 // requests in flight
const REPAINT_DELAY_MS = 120 // tiles arriving together are painted together

const cache = new Map() // key -> { state: 'loading' | 'ok' | 'missing', image, waiters }
const queue = [] // { entry, url, generation, rank }
let active = 0
let generationCounter = 0

function pump() {
  while (active < MAX_ACTIVE && queue.length > 0) {
    queue.sort((a, b) => a.rank - b.rank)
    const job = queue.shift()
    active++
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    const finish = (state) => {
      active--
      job.entry.state = state
      job.entry.image = state === 'ok' ? image : null
      for (const wake of job.entry.waiters) wake()
      job.entry.waiters.clear()
      pump()
    }
    image.onload = () => finish('ok')
    image.onerror = () => finish('missing') // 404: the layer has no tile there
    image.src = job.url
  }
}

function request(key, url, rank, generation, wake) {
  let entry = cache.get(key)
  if (entry) {
    cache.delete(key) // keep the recently used last
    cache.set(key, entry)
    if (entry.state === 'loading') entry.waiters.add(wake)
    return entry
  }
  entry = { state: 'loading', image: null, waiters: new Set([wake]) }
  cache.set(key, entry)
  for (const [oldKey, old] of cache) {
    if (cache.size <= CACHE_LIMIT) break
    if (old.state !== 'loading') cache.delete(oldKey)
  }
  queue.push({ entry, url, generation, rank })
  pump()
  return entry
}

// Requests of older windows that have not started are dropped; their tiles are asked for again if still needed.
function forgetBefore(generation) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].generation < generation) {
      const { entry } = queue[i]
      queue.splice(i, 1)
      for (const [key, value] of cache) {
        if (value === entry) {
          cache.delete(key)
          break
        }
      }
    }
  }
}

const newCanvas = (size) => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  return canvas
}

/**
 * A window drawn on `canvas` (square). `sources`: [{ layer, minLevel, maxLevel?, style, opacity }] bottom first, where layer is an
 * entry of TILE_LAYERS and style 'image' (tiles as they are), 'psr' (footprint of the permanently shadowed regions: tinted, outlined, the
 * images inside them faint) or 'rock' (translucent). `onPainted` is called after every repaint that changed the canvas.
 */
export class TileWindow {
  constructor({ canvas, sources, underlay = null, tint = 'rgb(168 130 255)', onPainted = () => {} }) {
    this.canvas = canvas
    this.underlay = underlay // a picture of the whole window drawn first (shown until the tiles have come)
    this.sources = sources
    this.tint = tint
    this.onPainted = onPainted
    this.win = null
    this.generation = 0
    this.timer = null
    this.scratch = null
    this.disposed = false
    this.wake = () => this.schedule()
  }

  /** The sources to draw (a layer switched on or off); the window is redrawn. */
  setSources(sources) {
    this.sources = sources
    this.paint()
  }

  /** Change the sources without drawing (the next setWindow draws). */
  configure(sources) {
    this.sources = sources
  }

  /** The window to show ({ cx, cy, span } in km), or null to leave the canvas empty. */
  setWindow(win) {
    this.win = win
    this.generation = ++generationCounter
    forgetBefore(this.generation)
    this.paint()
  }

  schedule() {
    if (this.timer !== null || this.disposed) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.paint()
    }, REPAINT_DELAY_MS)
  }

  dispose() {
    this.disposed = true
    clearTimeout(this.timer)
  }

  paint() {
    if (this.disposed) return
    const size = this.canvas.width
    const ctx = this.canvas.getContext('2d')
    ctx.clearRect(0, 0, size, size)
    if (this.underlay) ctx.drawImage(this.underlay, 0, 0, size, size)
    if (this.win) {
      for (const source of this.sources) this.paintSource(ctx, source, size)
    }
    this.onPainted()
  }

  paintSource(ctx, source, size) {
    const { layer } = source
    const win = this.win
    if (!windowMeetsBox(win, layer.boxKm)) return
    const pixelM = (win.span * 1000) / size
    const maxLevel = Math.min(source.maxLevel ?? layer.maxLevel, layer.maxLevel)
    // A source made for fine levels has nothing to add to a window whose pixels are coarser than its coarsest level.
    if (Math.ceil(Math.log2(pixelSizeM(0) / pixelM)) < (source.minLevel ?? 0)) return
    const level = levelForPixelSize(pixelM, source.minLevel ?? 0, maxLevel)
    // Translucent styles are drawn whole on a scratch canvas first, then laid over with their opacity (no double coverage by the passes).
    const layered = source.style === 'psr' || source.style === 'rock'
    const target = layered ? this.scratchContext(size) : ctx
    if (layered) target.clearRect(0, 0, size, size)
    const opacity = layered ? 1 : source.opacity ?? 1
    if (level - (source.minLevel ?? 0) >= 2) this.drawTiles(target, layer, Math.max(source.minLevel ?? 0, level - 3), size, opacity)
    this.drawTiles(target, layer, level, size, opacity)
    if (source.style === 'psr') this.compositePsr(ctx, size, source.opacity ?? 1)
    else if (source.style === 'rock') {
      ctx.save()
      ctx.globalAlpha = source.opacity ?? 1
      ctx.drawImage(this.scratch.canvas, 0, 0)
      ctx.restore()
    }
  }

  drawTiles(ctx, layer, level, size, opacity) {
    const win = this.win
    const left = win.cx - win.span / 2
    const top = win.cy + win.span / 2
    const scale = size / win.span
    ctx.save()
    ctx.globalAlpha = opacity
    ctx.imageSmoothingEnabled = true
    // The middle of the window first.
    const tiles = tilesCovering(win, level)
    for (const tile of tiles) {
      const dx = (tile.x0 - left) * scale
      const dy = (top - tile.y0) * scale
      const ds = tile.size * scale
      const rank = Math.hypot(dx + ds / 2 - size / 2, dy + ds / 2 - size / 2) + (8 - Math.min(level, 8)) * 4000 // coarse levels before fine ones
      const entry = request(`${layer.id}/${level}/${tile.row}/${tile.col}`, tileUrl(layer, level, tile.row, tile.col), rank, this.generation, this.wake)
      if (entry.state === 'ok') ctx.drawImage(entry.image, 0, 0, TILE_PX, TILE_PX, Math.floor(dx), Math.floor(dy), Math.ceil(ds) + 1, Math.ceil(ds) + 1)
    }
    ctx.restore()
  }

  scratchContext(size) {
    if (!this.scratch || this.scratch.canvas.width !== size) {
      this.scratch = { canvas: newCanvas(size), tint: newCanvas(size), edge: newCanvas(size) }
      for (const c of [this.scratch.canvas, this.scratch.tint, this.scratch.edge]) c.getContext('2d').imageSmoothingEnabled = true
    }
    return this.scratch.canvas.getContext('2d')
  }

  // Footprint of the shadowed regions (the opaque part of the tiles): the images inside it faint, a violet tint and a violet outline.
  compositePsr(ctx, size, opacity) {
    const { canvas, tint, edge } = this.scratch
    const t = tint.getContext('2d')
    t.clearRect(0, 0, size, size)
    t.globalCompositeOperation = 'source-over'
    t.drawImage(canvas, 0, 0)
    t.globalCompositeOperation = 'source-in'
    t.fillStyle = this.tint
    t.fillRect(0, 0, size, size)
    // The outline: the footprint minus the footprint eroded by a few pixels.
    const e = edge.getContext('2d')
    e.clearRect(0, 0, size, size)
    e.globalCompositeOperation = 'source-over'
    e.drawImage(canvas, 0, 0)
    const w = Math.max(2, Math.round(size / 700))
    const eroded = this.eroded ?? (this.eroded = newCanvas(size))
    const er = eroded.getContext('2d')
    er.clearRect(0, 0, size, size)
    er.globalCompositeOperation = 'source-over'
    er.drawImage(canvas, 0, 0)
    er.globalCompositeOperation = 'destination-in'
    for (const [dx, dy] of [[w, 0], [-w, 0], [0, w], [0, -w]]) er.drawImage(canvas, dx, dy)
    e.globalCompositeOperation = 'destination-out'
    e.drawImage(eroded, 0, 0)
    e.globalCompositeOperation = 'source-in'
    e.fillStyle = this.tint
    e.fillRect(0, 0, size, size)
    ctx.save()
    ctx.globalAlpha = 0.35 * opacity
    ctx.drawImage(canvas, 0, 0) // the images of the shadowed floors, faint
    ctx.globalAlpha = 0.3 * opacity
    ctx.drawImage(tint, 0, 0)
    ctx.globalAlpha = opacity
    ctx.drawImage(edge, 0, 0)
    ctx.restore()
  }
}
