// The .tileset and .tilemap file formats, plus the autotile rules. Plain data, no
// canvas, so tools, tests and the game all read files the same way.
// See docs/tilemaps.md for how people use them and docs/spec.md section 4.5c for the shape.

/**
 * One tile. A plain tile's frame is tileWidth by tileHeight. A terrain's frame is a
 * sheet 4 tiles wide and 3 tall: a 3 by 3 island on the left, and the inner corners
 * in the top tile of the fourth column. Pixels are one character each from PIXEL_CHARS.
 * @typedef {object} TileDef
 * @property {string} key One character that stands for this tile in a tilemap's rows.
 * @property {string} name
 * @property {'plain' | 'terrain'} kind
 * @property {'none' | 'solid' | 'top'} solid `top` is a platform you can jump up through.
 * @property {number} fps Animation speed when there is more than one frame.
 * @property {string[]} frames
 */

/**
 * @typedef {object} Tileset
 * @property {'tileset'} minijs
 * @property {number} version
 * @property {number} tileWidth
 * @property {number} tileHeight
 * @property {string[]} palette `#rrggbb` colors; PIXEL_CHARS[i + 1] means palette[i].
 * @property {TileDef[]} tiles
 */

/**
 * @typedef {object} TileLayer
 * @property {string} name
 * @property {string[]} rows One character per cell, top to bottom. `.` is empty.
 * @property {boolean} solid Do its solid tiles stop things?
 * @property {boolean} front Draw over things instead of behind them.
 * @property {number} parallax 1 scrolls with the world, 0.5 at half speed, 0 stays still.
 * @property {boolean} visible
 */

/**
 * @typedef {object} Tilemap
 * @property {'tilemap'} minijs
 * @property {number} version
 * @property {string} tileset File name of the tileset.
 * @property {number} width In tiles.
 * @property {number} height In tiles.
 * @property {TileLayer[]} layers
 * @property {Array<{ thing: string; x: number; y: number }>} things Things placed by hand, in pixels.
 */

/** `.` is see-through; every other character is a palette color, in this order. */
export const PIXEL_CHARS = '.0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!$%&*+-=?@^_~'
export const MAX_PALETTE = PIXEL_CHARS.length - 1
export const TILE_SIZES = [8, 12, 16, 24, 32]
/** Characters a tile can use as its key in tilemap rows: never `.` or a space. */
export const TILE_KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!$%&*+-=?@^_~'
export const MAX_TILES = TILE_KEYS.length
export const MAX_MAP_SIDE = 512

const CHAR_INDEX = new Map([...PIXEL_CHARS].map((ch, i) => [ch, i]))

/**
 * Pixels in one frame of a tile.
 * @param {Tileset} tileset
 * @param {TileDef} tile
 * @returns {{ w: number; h: number }}
 */
export function frameSize(tileset, tile) {
  return tile.kind === 'terrain'
    ? { w: tileset.tileWidth * 4, h: tileset.tileHeight * 3 }
    : { w: tileset.tileWidth, h: tileset.tileHeight }
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Read a .tileset file. Wrong or short data is repaired where it can be; a file that isn't one at all gives null.
 * @param {string} text
 * @returns {Tileset | null}
 */
export function parseTileset(text) {
  const raw = /** @type {any} */ (parseJson(text))
  if (!raw || raw.minijs !== 'tileset' || !Array.isArray(raw.tiles)) return null
  const tileWidth = evenSize(raw.tileWidth)
  const tileHeight = evenSize(raw.tileHeight)
  const palette = Array.isArray(raw.palette) ? raw.palette.filter((c) => typeof c === 'string').slice(0, MAX_PALETTE) : []
  /** @type {Set<string>} */
  const usedKeys = new Set()
  /** @type {Tileset} */
  const tileset = { minijs: 'tileset', version: 1, tileWidth, tileHeight, palette, tiles: [] }
  for (const t of raw.tiles) {
    if (!t || typeof t !== 'object') continue
    const kind = t.kind === 'terrain' ? 'terrain' : 'plain'
    let key = typeof t.key === 'string' && [...t.key].length === 1 && t.key !== '.' && t.key !== ' ' ? t.key : ''
    if (key === '' || usedKeys.has(key)) key = [...TILE_KEYS].find((k) => !usedKeys.has(k)) ?? ''
    if (key === '') continue
    usedKeys.add(key)
    /** @type {TileDef} */
    const tile = {
      key,
      name: typeof t.name === 'string' && t.name !== '' ? t.name.toLowerCase() : `tile-${tileset.tiles.length + 1}`,
      kind,
      solid: t.solid === 'solid' || t.solid === 'top' ? t.solid : 'none',
      fps: typeof t.fps === 'number' && t.fps > 0 ? t.fps : 6,
      frames: [],
    }
    const { w, h } = frameSize(tileset, tile)
    const frames = Array.isArray(t.frames) ? t.frames.filter((f) => typeof f === 'string') : []
    tile.frames = (frames.length > 0 ? frames : ['']).map((f) => f.padEnd(w * h, '.').slice(0, w * h))
    tileset.tiles.push(tile)
  }
  return tileset
}

/** @param {unknown} v */
function evenSize(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 16
  return Math.max(2, Math.min(64, n + (n % 2)))
}

/**
 * @param {unknown} v
 * @param {number} fallback
 */
function mapSide(v, fallback) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
  return Math.max(1, Math.min(MAX_MAP_SIDE, n))
}

/**
 * Read a .tilemap file.
 * @param {string} text
 * @returns {Tilemap | null}
 */
export function parseTilemap(text) {
  const raw = /** @type {any} */ (parseJson(text))
  if (!raw || raw.minijs !== 'tilemap' || !Array.isArray(raw.layers)) return null
  const width = mapSide(raw.width, 40)
  const height = mapSide(raw.height, 20)
  /** @type {Tilemap} */
  const map = {
    minijs: 'tilemap',
    version: 1,
    tileset: typeof raw.tileset === 'string' ? raw.tileset : '',
    width,
    height,
    layers: [],
    things: [],
  }
  for (const l of raw.layers) {
    if (!l || typeof l !== 'object') continue
    const rows = Array.isArray(l.rows) ? l.rows.filter((r) => typeof r === 'string') : []
    map.layers.push({
      name: typeof l.name === 'string' && l.name !== '' ? l.name : `Layer ${map.layers.length + 1}`,
      rows: Array.from({ length: height }, (_, r) => [...(rows[r] ?? '')].slice(0, width).join('').padEnd(width, '.')),
      solid: l.solid !== false,
      front: l.front === true,
      parallax: typeof l.parallax === 'number' ? Math.max(0, Math.min(2, l.parallax)) : 1,
      visible: l.visible !== false,
    })
  }
  if (Array.isArray(raw.things)) {
    for (const t of raw.things) {
      if (t && typeof t.thing === 'string' && typeof t.x === 'number' && typeof t.y === 'number') {
        map.things.push({ thing: t.thing.toLowerCase(), x: t.x, y: t.y })
      }
    }
  }
  return map
}

/**
 * Pretty but compact JSON: rows and frames stay on one line each, so files diff well.
 * @param {Tileset | Tilemap | object} data
 * @returns {string}
 */
export function stringifyAsset(data) {
  return `${JSON.stringify(data, null, 1)}\n`
}

/**
 * RGBA bytes for one frame.
 * @param {Tileset} tileset
 * @param {string} frame
 * @param {number} w
 * @param {number} h
 * @param {Uint8ClampedArray} [out]
 * @returns {Uint8ClampedArray}
 */
export function frameToRgba(tileset, frame, w, h, out = new Uint8ClampedArray(w * h * 4)) {
  const colors = tileset.palette.map(hexToRgb)
  for (let i = 0; i < w * h; i++) {
    const index = CHAR_INDEX.get(frame[i]) ?? 0
    const at = i * 4
    if (index === 0) {
      out[at + 3] = 0
      continue
    }
    const c = colors[index - 1] ?? [255, 0, 255]
    out[at] = c[0]
    out[at + 1] = c[1]
    out[at + 2] = c[2]
    out[at + 3] = 255
  }
  return out
}

/**
 * @param {string} hex `#rgb` or `#rrggbb`
 * @returns {[number, number, number]}
 */
export function hexToRgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = Number.parseInt(h, 16)
  if (Number.isNaN(n)) return [255, 0, 255]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The neighbors a terrain cell looks at, as bits of its mask. */
export const N = 1
export const E = 2
export const S = 4
export const W = 8
export const NE = 16
export const SE = 32
export const SW = 64
export const NW = 128

/**
 * Which piece of the terrain sheet each corner of a cell shows, for every one of the
 * 256 neighbor combinations. Entry [mask * 8 + corner * 2] is the sheet column, the
 * next is the sheet row. Corners run top-left, top-right, bottom-left, bottom-right.
 * @type {Uint8Array}
 */
export const TERRAIN_PIECES = buildTerrainPieces()

function buildTerrainPieces() {
  const out = new Uint8Array(256 * 8)
  for (let mask = 0; mask < 256; mask++) {
    const n = (mask & N) !== 0
    const e = (mask & E) !== 0
    const s = (mask & S) !== 0
    const w = (mask & W) !== 0
    /**
     * @param {boolean} vertical the neighbor above or below
     * @param {boolean} side the neighbor left or right
     * @param {boolean} diagonal
     * @param {[number, number]} outer
     * @param {[number, number]} edgeH
     * @param {[number, number]} edgeV
     * @returns {[number, number]}
     */
    const pick = (vertical, side, diagonal, outer, edgeH, edgeV) => {
      if (!vertical && !side) return outer
      if (!vertical) return edgeH
      if (!side) return edgeV
      return diagonal ? [1, 1] : [3, 0]
    }
    const corners = [
      pick(n, w, (mask & NW) !== 0, [0, 0], [1, 0], [0, 1]),
      pick(n, e, (mask & NE) !== 0, [2, 0], [1, 0], [2, 1]),
      pick(s, w, (mask & SW) !== 0, [0, 2], [1, 2], [0, 1]),
      pick(s, e, (mask & SE) !== 0, [2, 2], [1, 2], [2, 1]),
    ]
    corners.forEach(([col, row], c) => {
      out[mask * 8 + c * 2] = col
      out[mask * 8 + c * 2 + 1] = row
    })
  }
  return out
}

/**
 * Work out a terrain cell's mask. Off the edge of the map counts as the same terrain,
 * so terrain runs off the side of a level without a border.
 * @param {(col: number, row: number) => boolean} same
 * @param {number} col
 * @param {number} row
 * @returns {number}
 */
export function terrainMask(same, col, row) {
  return (
    (same(col, row - 1) ? N : 0) |
    (same(col + 1, row) ? E : 0) |
    (same(col, row + 1) ? S : 0) |
    (same(col - 1, row) ? W : 0) |
    (same(col + 1, row - 1) ? NE : 0) |
    (same(col + 1, row + 1) ? SE : 0) |
    (same(col - 1, row + 1) ? SW : 0) |
    (same(col - 1, row - 1) ? NW : 0)
  )
}

/**
 * @typedef {object} TileAtlas
 * @property {HTMLCanvasElement | OffscreenCanvas | null} source Null where there is no canvas (tests, tools).
 * @property {Array<Array<{ x: number; y: number }>>} frames Per tile, per frame: where it sits in the picture.
 */

/**
 * @param {number} w
 * @param {number} h
 * @returns {HTMLCanvasElement | OffscreenCanvas | null}
 */
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  return null
}

/**
 * Draw a tileset once into one picture, so playing the game only copies pixels.
 * @param {Tileset} tileset
 * @returns {TileAtlas}
 */
export function buildAtlas(tileset) {
  /** @type {TileAtlas['frames']} */
  const frames = []
  const padding = 1
  const maxWidth = 1024
  let x = padding
  let y = padding
  let rowHeight = 0
  let width = 0
  for (const tile of tileset.tiles) {
    const { w, h } = frameSize(tileset, tile)
    /** @type {Array<{ x: number; y: number }>} */
    const spots = []
    for (let f = 0; f < tile.frames.length; f++) {
      if (x + w + padding > maxWidth && x > padding) {
        x = padding
        y += rowHeight + padding
        rowHeight = 0
      }
      spots.push({ x, y })
      x += w + padding
      rowHeight = Math.max(rowHeight, h)
      width = Math.max(width, x)
    }
    frames.push(spots)
  }
  const height = y + rowHeight + padding
  const source = tileset.tiles.length > 0 ? makeCanvas(Math.max(1, width), Math.max(1, height)) : null
  const ctx = source ? /** @type {CanvasRenderingContext2D} */ (source.getContext('2d')) : null
  if (ctx) {
    tileset.tiles.forEach((tile, t) => {
      const { w, h } = frameSize(tileset, tile)
      tile.frames.forEach((frame, f) => {
        const pixels = new ImageData(frameToRgba(tileset, frame, w, h), w, h)
        ctx.putImageData(pixels, frames[t][f].x, frames[t][f].y)
      })
    })
  }
  return { source, frames }
}
