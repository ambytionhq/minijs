// The tiles every new tile set starts with, drawn by code. Terrain tiles also get
// their edges drawn here, which is the same thing the "Draw edges for me" button does.

import { PIXEL_CHARS, stringifyAsset } from '@minijs/runtime'

/** @import { TileDef, Tileset } from '@minijs/runtime/src/tiles/format.js' */

export const STARTER_PALETTE = [
  '#1f2430', '#3a4152', '#5e6a7d', '#8d99a8', '#c4cdd5', '#f2f4f3',
  '#2f5233', '#3f7a3f', '#5fa83e', '#8fd14f', '#c9e265',
  '#3d2c23', '#5b3f2e', '#7d5a3c', '#a67c52', '#d1a974', '#ecd9a8',
  '#1b3a6b', '#2a64ad', '#3f95d6', '#7cc7ef', '#c6eaf8',
  '#6e1f1f', '#b03022', '#e4572e', '#f79a2e', '#fdd34d', '#fff2a8',
  '#5a3a7a', '#8d5fb5', '#e38bb4',
]

/** Character for a palette color. @param {string} hex */
const c = (hex) => PIXEL_CHARS[STARTER_PALETTE.indexOf(hex) + 1]

/** Noise that is the same every time. @param {number} x @param {number} y @param {number} seed */
function speckle(x, y, seed) {
  let n = Math.imul(x * 374761393 + y * 668265263 + seed * 2147483647, 1274126177)
  n = Math.imul(n ^ (n >>> 13), 1103515245)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

/**
 * @param {number} w
 * @param {number} h
 * @param {(x: number, y: number) => string} pixel returns a pixel character
 */
function paint(w, h, pixel) {
  let out = ''
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out += pixel(x, y)
  return out
}

/**
 * Build a terrain's whole sheet from a repeating fill and an edge. Exposed sides get an
 * edge band; the top side can have its own color and thickness, like grass on dirt.
 * @param {object} o
 * @param {number} o.tileW
 * @param {number} o.tileH
 * @param {(x: number, y: number) => string} o.fill Pixel of the middle, in sheet pixels.
 * @param {(x: number, y: number) => string} o.edge Pixel of the side and bottom edges.
 * @param {(x: number, y: number) => string} [o.top] Pixel of the top edge. Same as edge if left out.
 * @param {number} [o.edgeWidth] Side edge thickness in pixels.
 * @param {number} [o.topWidth] Top edge thickness in pixels.
 * @returns {string}
 */
export function makeTerrainSheet({ tileW, tileH, fill, edge, top = edge, edgeWidth = 1, topWidth = edgeWidth }) {
  return paint(tileW * 4, tileH * 3, (sx, sy) => {
    const col = Math.floor(sx / tileW)
    const row = Math.floor(sy / tileH)
    const x = sx % tileW
    const y = sy % tileH
    if (col === 3 && row > 0) return '.'
    if (col === 3) {
      // Inner corners: only the very corner of each quarter is exposed.
      const nearTop = y < topWidth
      const nearBottom = y >= tileH - edgeWidth
      const nearLeft = x < edgeWidth
      const nearRight = x >= tileW - edgeWidth
      if (nearTop && (nearLeft || nearRight)) return top(sx, sy)
      if (nearBottom && (nearLeft || nearRight)) return edge(sx, sy)
      return fill(sx, sy)
    }
    // Which sides of this cell of the 3 by 3 island face outside?
    if (row === 0 && y < topWidth) return top(sx, sy)
    if (row === 2 && y >= tileH - edgeWidth) return edge(sx, sy)
    if (col === 0 && x < edgeWidth) return edge(sx, sy)
    if (col === 2 && x >= tileW - edgeWidth) return edge(sx, sy)
    return fill(sx, sy)
  })
}

/**
 * @param {string} hexA
 * @param {string} hexB
 * @param {number} seed
 * @param {number} [amount] how much of hexB
 */
const mottled = (hexA, hexB, seed, amount = 0.14) => (/** @type {number} */ x, /** @type {number} */ y) =>
  speckle(x, y, seed) < amount ? c(hexB) : c(hexA)

const S = 16

/**
 * @param {string} key
 * @param {string} name
 * @param {TileDef['solid']} solid
 * @param {(x: number, y: number) => string} pixel
 * @returns {TileDef}
 */
const plain = (key, name, solid, pixel) => ({ key, name, kind: 'plain', solid, fps: 6, frames: [paint(S, S, pixel)] })

/** @returns {TileDef[]} */
function starterTiles() {
  const stoneFill = mottled('#5e6a7d', '#3a4152', 3, 0.1)
  const dirtFill = mottled('#7d5a3c', '#5b3f2e', 5)
  const sandFill = mottled('#ecd9a8', '#d1a974', 9)
  /** @param {number} shift */
  const waterFill = (shift) => (/** @type {number} */ x, /** @type {number} */ y) => {
    const band = Math.sin(((x + shift) / S) * Math.PI * 2 + y * 0.9)
    return band > 0.72 ? c('#7cc7ef') : band < -0.7 ? c('#2a64ad') : c('#3f95d6')
  }
  /** @param {number} shift */
  const lavaFrame = (shift) => paint(S, S, (x, y) => {
    const band = Math.sin(((x + shift) / S) * Math.PI * 2 + y * 0.8) + Math.sin((y + shift) * 0.7) * 0.5
    return band > 0.8 ? c('#fdd34d') : band > -0.1 ? c('#f79a2e') : band > -0.8 ? c('#e4572e') : c('#b03022')
  })
  /** @param {number} width half width of the coin, for spinning */
  const coinFrame = (width) => paint(S, S, (x, y) => {
    const dx = (x - 7.5) / Math.max(width, 0.6)
    const dy = (y - 7.5) / 5
    const d = dx * dx + dy * dy
    if (d > 1) return '.'
    if (d > 0.62) return c('#f79a2e')
    return x < 7.5 && y < 7.5 ? c('#fff2a8') : c('#fdd34d')
  })
  const brick = (/** @type {number} */ x, /** @type {number} */ y) => {
    const row = Math.floor(y / 4)
    const shift = row % 2 === 0 ? 0 : 4
    if (y % 4 === 3 || (x + shift) % 8 === 7) return c('#6e1f1f')
    return speckle(x, y, 11) < 0.12 ? c('#e4572e') : c('#b03022')
  }
  return [
    {
      key: 'g', name: 'grass', kind: 'terrain', solid: 'solid', fps: 6,
      frames: [makeTerrainSheet({ tileW: S, tileH: S, fill: dirtFill, edge: (x, y) => mottled('#5b3f2e', '#3d2c23', 6)(x, y), top: (x, y) => (y % S === 0 ? c('#c9e265') : speckle(x, y, 7) < 0.25 ? c('#5fa83e') : c('#8fd14f')), edgeWidth: 1, topWidth: 4 })],
    },
    {
      key: 'd', name: 'dirt', kind: 'terrain', solid: 'solid', fps: 6,
      frames: [makeTerrainSheet({ tileW: S, tileH: S, fill: dirtFill, edge: mottled('#5b3f2e', '#3d2c23', 6), edgeWidth: 2 })],
    },
    {
      key: 's', name: 'stone', kind: 'terrain', solid: 'solid', fps: 6,
      frames: [makeTerrainSheet({ tileW: S, tileH: S, fill: stoneFill, edge: () => c('#3a4152'), top: () => c('#8d99a8'), edgeWidth: 1, topWidth: 2 })],
    },
    {
      key: 'a', name: 'sand', kind: 'terrain', solid: 'solid', fps: 6,
      frames: [makeTerrainSheet({ tileW: S, tileH: S, fill: sandFill, edge: () => c('#d1a974'), edgeWidth: 1 })],
    },
    {
      key: 'w', name: 'water', kind: 'terrain', solid: 'none', fps: 4,
      frames: [0, 4, 8, 12].map((shift) => makeTerrainSheet({ tileW: S, tileH: S, fill: waterFill(shift), edge: () => c('#1b3a6b'), top: () => c('#c6eaf8'), edgeWidth: 1, topWidth: 2 })),
    },
    { key: 'l', name: 'lava', kind: 'plain', solid: 'none', fps: 5, frames: [0, 4, 8, 12].map(lavaFrame) },
    plain('b', 'brick', 'solid', brick),
    plain('t', 'plank', 'top', (x, y) => {
      if (y > 5) return '.'
      if (y === 0) return c('#d1a974')
      if (y === 5) return c('#5b3f2e')
      return x % 5 === 4 ? c('#5b3f2e') : c('#a67c52')
    }),
    plain('c', 'crate', 'solid', (x, y) => {
      if (x === 0 || y === 0 || x === S - 1 || y === S - 1) return c('#5b3f2e')
      if (x === y || x + y === S - 1) return c('#7d5a3c')
      return c('#a67c52')
    }),
    { key: 'o', name: 'coin', kind: 'plain', solid: 'none', fps: 8, frames: [5, 4, 2, 1, 2, 4].map(coinFrame) },
    plain('x', 'spikes', 'none', (x, y) => {
      const tooth = Math.abs((x % 5) - 2)
      if (y < 7 + tooth * 3) return '.'
      return x % 5 === 2 ? c('#c4cdd5') : c('#8d99a8')
    }),
    plain('h', 'ladder', 'none', (x, y) => {
      if (x === 3 || x === 12) return c('#7d5a3c')
      return y % 4 === 1 && x > 3 && x < 12 ? c('#a67c52') : '.'
    }),
    plain('f', 'flower', 'none', (x, y) => {
      if (y >= 9 && x === 7) return c('#3f7a3f')
      if (y === 12 && (x === 8 || x === 9)) return c('#5fa83e')
      const dx = x - 7
      const dy = y - 5
      const d = dx * dx + dy * dy
      if (d <= 1) return c('#fdd34d')
      return d <= 8 ? c('#e38bb4') : '.'
    }),
    plain('u', 'bush', 'none', (x, y) => {
      const d = ((x - 7.5) / 8) ** 2 + ((y - 15) / 10) ** 2
      if (d > 1) return '.'
      return speckle(x, y, 13) < 0.2 ? c('#5fa83e') : c('#3f7a3f')
    }),
  ]
}

/** @returns {Tileset} */
export function starterTileset() {
  return {
    minijs: 'tileset',
    version: 1,
    tileWidth: S,
    tileHeight: S,
    palette: [...STARTER_PALETTE],
    tiles: starterTiles(),
  }
}

/**
 * A tile set with nothing in it yet.
 * @param {number} size tile width and height
 * @returns {Tileset}
 */
export function blankTileset(size) {
  return { minijs: 'tileset', version: 1, tileWidth: size, tileHeight: size, palette: [...STARTER_PALETTE], tiles: [] }
}

/**
 * A new tile map: ground across the bottom, so it does something the moment it runs.
 * @param {string} tilesetName
 * @param {number} [width]
 * @param {number} [height]
 */
export function starterTilemap(tilesetName, width = 40, height = 12) {
  const empty = '.'.repeat(width)
  const rows = Array.from({ length: height }, (_, r) => (r >= height - 2 ? 'g'.repeat(width) : empty))
  return {
    minijs: 'tilemap',
    version: 1,
    tileset: tilesetName,
    width,
    height,
    layers: [{ name: 'Ground', rows, solid: true, front: false, parallax: 1, visible: true }],
    things: [],
  }
}

export const newTilesetText = () => stringifyAsset(starterTileset())
