// The minijs mark, drawn as 16x16 pixel art and scaled up crisp, for the web
// app manifest, favicons and the desktop app (src-tauri/icons is made from
// icon-1024.png with `npx tauri icon`).
// Run: node scripts/make-icons.mjs

import { join } from 'node:path'
import { Bitmap, rgba } from './png.mjs'

const MARK = [
  '................',
  '................',
  '............y...',
  '...........yyy..',
  '............y...',
  '................',
  '................',
  '...GGGGG.GGGG...',
  '...GGGGGGGGGGd..',
  '...GGd.GGd.GGd..',
  '...GGd.GGd.GGd..',
  '...GGd.GGd.GGd..',
  '...GGd.GGd.GGd..',
  '...ddd.ddd.ddd..',
  '................',
  '................',
]
const COLORS = { g: '#065f46', G: '#34d399', d: '#047857', y: '#ffd23f' }
const BG = '#101614'
const BG_EDGE = '#1d2a25'

/**
 * @param {number} size output size in pixels
 * @param {{ padding: number; round: boolean }} options padding as a fraction of size
 */
function icon(size, { padding, round }) {
  const b = new Bitmap(size, size)
  const radius = round ? size * 0.22 : 0
  const inside = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (!round) return true
    const cx = Math.min(Math.max(x, radius), size - radius)
    const cy = Math.min(Math.max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue
      // Soft top-left light on the tile.
      const t = (x + y) / (2 * size)
      const a = rgba(BG_EDGE)
      const c = rgba(BG)
      b.set(x, y, [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + c[i] * t)).concat(255))
    }
  }
  const art = size * (1 - padding * 2)
  const cell = Math.floor(art / 16)
  const offset = Math.floor((size - cell * 16) / 2)
  b.sprite(MARK, COLORS, offset, offset, cell)
  return b
}

const web = join(import.meta.dirname, '../playground/public/icons')
icon(512, { padding: 0.08, round: true }).save(join(web, 'icon-512.png'))
icon(192, { padding: 0.08, round: true }).save(join(web, 'icon-192.png'))
icon(512, { padding: 0.18, round: false }).save(join(web, 'maskable-512.png'))
icon(180, { padding: 0.1, round: false }).save(join(web, 'apple-touch-icon.png'))
icon(64, { padding: 0.04, round: true }).save(join(web, 'favicon-64.png'))
icon(1024, { padding: 0.1, round: true }).save(join(import.meta.dirname, '../apps/desktop/icon-1024.png'))
icon(1200, { padding: 0.12, round: false }).save(join(import.meta.dirname, '../site/public/icon-1200.png'))
console.log('wrote icons')
