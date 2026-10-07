// Tiny pixel-art toolkit for the example games. No dependencies:
// an RGBA bitmap, drawing helpers, a 5x7 pixel font, and a PNG encoder on node:zlib.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { deflateSync } from 'node:zlib'

/** @typedef {[number, number, number, number]} Rgba */

/**
 * '#rrggbb' or '#rrggbbaa' to RGBA.
 * @param {string} hex
 * @returns {Rgba}
 */
export function rgba(hex) {
  const h = hex.replace('#', '')
  const n = (/** @type {number} */ i) => parseInt(h.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 255]
}

export class Bitmap {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width
    this.height = height
    this.data = new Uint8Array(width * height * 4)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {Rgba} color
   */
  set(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || color[3] === 0) return
    const i = (Math.floor(y) * this.width + Math.floor(x)) * 4
    this.data.set(color, i)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {Rgba}
   */
  get(x, y) {
    const i = (y * this.width + x) * 4
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {Rgba} color
   */
  fill(x, y, w, h, color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color)
  }

  /**
   * Draw a sprite given as text rows; each character maps to a palette color, '.' is transparent.
   * @param {string[]} rows
   * @param {Record<string, string>} palette
   * @param {number} [x=0]
   * @param {number} [y=0]
   * @param {number} [scale=1]
   */
  sprite(rows, palette, x = 0, y = 0, scale = 1) {
    rows.forEach((row, j) => {
      ;[...row].forEach((ch, i) => {
        if (ch === '.' || ch === ' ') return
        const hex = palette[ch]
        if (!hex) throw new Error(`no palette color for "${ch}"`)
        this.fill(x + i * scale, y + j * scale, scale, scale, rgba(hex))
      })
    })
  }

  /**
   * Text in the 5x7 pixel font. Returns the width drawn.
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {string} color
   * @param {number} [scale=1]
   */
  text(text, x, y, color, scale = 1) {
    const c = rgba(color)
    let cx = x
    for (const ch of text.toUpperCase()) {
      const glyph = FONT[ch] ?? FONT['?']
      glyph.forEach((row, j) => {
        ;[...row].forEach((bit, i) => {
          if (bit === '#') this.fill(cx + i * scale, y + j * scale, scale, scale, c)
        })
      })
      cx += (glyph[0].length + 1) * scale
    }
    return cx - x - scale
  }

  /**
   * Draw `color` around every opaque pixel (a one-pixel outline).
   * @param {string} color
   */
  outline(color) {
    const c = rgba(color)
    const copy = new Uint8Array(this.data)
    const opaque = (/** @type {number} */ x, /** @type {number} */ y) =>
      x >= 0 && y >= 0 && x < this.width && y < this.height && copy[(y * this.width + x) * 4 + 3] > 0
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (opaque(x, y)) continue
        if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) this.set(x, y, c)
      }
    }
  }

  /** @returns {Buffer} */
  png() {
    return encodePng(this.width, this.height, this.data)
  }

  /** @param {string} path */
  save(path) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, this.png())
  }
}

/** Width in pixels of `text` in the 5x7 font at `scale`. @param {string} text @param {number} [scale=1] */
export function textWidth(text, scale = 1) {
  let w = 0
  for (const ch of text.toUpperCase()) w += ((FONT[ch] ?? FONT['?'])[0].length + 1) * scale
  return Math.max(0, w - scale)
}

/**
 * A new bitmap with one sprite drawn into it.
 * @param {string[]} rows
 * @param {Record<string, string>} palette
 */
export function spriteBitmap(rows, palette) {
  const b = new Bitmap(rows[0].length, rows.length)
  b.sprite(rows, palette)
  return b
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

/** @param {Uint8Array} bytes */
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * @param {string} type
 * @param {Uint8Array} data
 */
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * RGBA, 8 bits per channel, filter 0 on every row.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgbaData
 */
export function encodePng(width, height, rgbaData) {
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * 4)
    raw[start] = 0
    raw.set(rgbaData.subarray(y * width * 4, (y + 1) * width * 4), start + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}

/**
 * Width and height from a PNG file's header.
 * @param {Uint8Array} bytes
 * @returns {{ width: number; height: number }}
 */
export function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** 5x7 pixel font. Narrow glyphs are allowed (I, !, punctuation). */
export const FONT = /** @type {Record<string, string[]>} */ ({
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  ':': ['.', '#', '.', '.', '.', '#', '.'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
})
