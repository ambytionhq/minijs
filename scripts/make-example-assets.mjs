// Writes the 16x16 hero PNGs used by examples/hero.mini into examples/basics/assets/.
// No dependencies: a tiny PNG encoder (RGBA, filter 0) on top of node:zlib.
// Run: node scripts/make-example-assets.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

const OUT = join(import.meta.dirname, '../examples/basics/assets')

/** Palette: one character per pixel. '.' is transparent. */
const PALETTE = {
  '.': [0, 0, 0, 0],
  k: [34, 32, 52, 255], // outline
  h: [143, 86, 59, 255], // hair
  s: [238, 195, 154, 255], // skin
  e: [34, 32, 52, 255], // eye
  r: [217, 87, 99, 255], // shirt
  b: [91, 110, 225, 255], // trousers
  o: [102, 57, 49, 255], // boots
}

// Head and body are shared; only the legs change between frames.
const TOP = [
  '................',
  '.....kkkkkk.....',
  '....khhhhhhk....',
  '....khhhhhhhk...',
  '....kssssshhk...',
  '....ksesesshk...',
  '....kssssssk....',
  '.....kssssk.....',
  '....krrrrrrk....',
  '...ksrrrrrrsk...',
  '...ksrrrrrrsk...',
  '....kbbbbbbk....',
]

const LEGS = {
  idle: ['....kbbkkbbk....', '....kbbkkbbk....', '....kook.kook...', '....kkkk.kkkk...'],
  1: ['....kbbkkbbk....', '...kbbk..kbbk...', '..kook....kook..', '..kkkk....kkkk..'],
  2: ['.....kbbbbk.....', '.....kbbbbk.....', '.....koook......', '.....kkkkk......'],
  3: ['....kbbkkbbk....', '....kbbk.kbbk...', '...kook...kook..', '...kkkk...kkkk..'],
}

/** @type {Record<string, string[]>} */
const FRAMES = {
  'hero-idle.png': [...TOP, ...LEGS.idle],
  'hero-1.png': [...TOP, ...LEGS[1]],
  'hero-2.png': [...TOP, ...LEGS[2]],
  'hero-3.png': [...TOP, ...LEGS[3]],
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
 * @param {string} type four ASCII letters
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

/** @param {string[]} rows */
function encodePng(rows) {
  const height = rows.length
  const width = rows[0].length
  const raw = Buffer.alloc(height * (1 + width * 4))
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} is ${row.length} wide, expected ${width}`)
    const start = y * (1 + width * 4)
    raw[start] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const color = PALETTE[/** @type {keyof typeof PALETTE} */ (row[x])]
      if (!color) throw new Error(`unknown palette letter "${row[x]}"`)
      raw.set(color, start + 1 + x * 4)
    }
  })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}

mkdirSync(OUT, { recursive: true })
for (const [name, rows] of Object.entries(FRAMES)) {
  writeFileSync(join(OUT, name), encodePng(rows))
  console.log(`wrote examples/basics/assets/${name}`)
}
