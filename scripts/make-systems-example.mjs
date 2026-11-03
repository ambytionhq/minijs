// Writes the files of examples/lantern-garden: its tile set, tile map, sounds, music
// and particle effect. These are the same files Studio's editors make and open.
// Run again after changing the starter tiles: node scripts/make-systems-example.mjs

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PARTICLE_PRESETS, SOUND_PRESETS } from '../packages/lang/src/index.js'
import { stringifyAsset } from '../packages/runtime/src/tiles/format.js'
import { starterTileset } from '../playground/src/tools/starter-tiles.js'

const dir = fileURLToPath(new URL('../examples/lantern-garden/', import.meta.url))
const put = (name, data) => writeFileSync(join(dir, name), stringifyAsset(data))

put('garden.tileset', starterTileset())

const W = 60
const H = 12
/** A blank layer of rows that can be drawn on. */
const blank = () => Array.from({ length: H }, () => Array(W).fill('.'))
const box = (grid, x1, y1, x2, y2, ch) => {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) grid[y][x] = ch
}

const ground = blank()
box(ground, 0, 10, 13, 11, 'g')
box(ground, 18, 10, 31, 11, 'g')
box(ground, 24, 8, 27, 9, 's')
box(ground, 36, 10, 44, 11, 'g')
box(ground, 49, 10, 59, 11, 'g')
box(ground, 53, 8, 56, 9, 's')
// Platforms you can jump up through.
for (const [x, y, n] of [[7, 7, 4], [15, 7, 2], [32, 7, 3], [45, 7, 3]]) box(ground, x, y, x + n - 1, y, 't')

const water = blank()
box(water, 14, 11, 17, 11, 'w')
box(water, 32, 11, 35, 11, 'w')
box(water, 45, 11, 48, 11, 'w')

const decor = blank()
for (const [x, y, ch] of [[2, 9, 'f'], [4, 9, 'u'], [12, 9, 'f'], [20, 9, 'u'], [22, 9, 'f'], [37, 9, 'u'], [41, 9, 'f'], [50, 9, 'f'], [58, 9, 'u']]) decor[y][x] = ch

const items = blank()
for (const [x, y] of [[8, 6], [9, 6], [16, 6], [25, 7], [26, 7], [33, 6], [46, 6], [54, 7], [55, 7], [40, 9]]) items[y][x] = 'o'
items[9][51] = 'x'

const rows = (grid) => grid.map((r) => r.join(''))

put('garden.tilemap', {
  minijs: 'tilemap',
  version: 1,
  tileset: 'garden.tileset',
  width: W,
  height: H,
  layers: [
    { name: 'Water', rows: rows(water), solid: false, front: false, parallax: 1, visible: true },
    { name: 'Decoration', rows: rows(decor), solid: false, front: false, parallax: 1, visible: true },
    { name: 'Ground', rows: rows(ground), solid: true, front: false, parallax: 1, visible: true },
    { name: 'Coins and spikes', rows: rows(items), solid: false, front: false, parallax: 1, visible: true },
  ],
  things: [
    { thing: 'beetle', x: 22 * 16, y: 9 * 16 },
    { thing: 'beetle', x: 40 * 16, y: 9 * 16 },
  ],
})

put('pop.particles', { minijs: 'particles', version: 1, ...PARTICLE_PRESETS.sparkle, amount: 18, colors: ['#fff2a8', '#fdd34d', '#f79a2e'] })
put('hop.sound', { minijs: 'sound', version: 1, ...SOUND_PRESETS.jump })

const melody = [[0, 72, 2], [2, 74, 2], [4, 76, 4], [8, 79, 2], [10, 76, 2], [12, 74, 4], [16, 72, 2], [18, 69, 2], [20, 72, 4], [24, 74, 2], [26, 76, 2], [28, 72, 4]]
const bass = [[0, 48, 6], [8, 53, 6], [16, 45, 6], [24, 55, 6]]
const drums = []
for (let s = 0; s < 32; s += 8) drums.push([s, 0, 1], [s + 4, 2, 1])
put('garden.music', {
  minijs: 'music',
  version: 1,
  tempo: 108,
  steps: 32,
  scale: 'major-pentatonic',
  root: 60,
  tracks: [
    { name: 'Melody', wave: 'triangle', volume: 70, muted: false, notes: melody },
    { name: 'Bass', wave: 'sine', volume: 85, muted: false, notes: bass },
    { name: 'Harmony', wave: 'sine', volume: 40, muted: false, notes: [] },
    { name: 'Drums', wave: 'drums', volume: 40, muted: false, notes: drums },
  ],
})
