// A tiny picture for each visual file in the file list: tiles, a little map, a burst
// of colors, a sound's shape. They come from the file itself, so they change as it does.

import { parseParticles, parseSong, parseSoundFile, parseTilemap, parseTileset, renderSound, terrainMask } from '@minijs/runtime'
import { visualKind } from './index.js'
import { drawCell, frameCanvas } from './tile-draw.js'

/** @import { ProjectFs } from '../files/project.js' */

const SIZE = 36

/** @returns {[HTMLCanvasElement, CanvasRenderingContext2D]} */
function blank() {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  return [canvas, /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))]
}

/** @param {string} text */
function tilesetThumb(text) {
  const set = parseTileset(text)
  if (!set || set.tiles.length === 0) return null
  const [canvas, c] = blank()
  c.imageSmoothingEnabled = false
  const side = 2
  const cell = SIZE / side
  const scale = cell / set.tileWidth
  set.tiles.slice(0, side * side).forEach((tile, i) => {
    const picture = frameCanvas(set, tile, tile.frames[0])
    drawCell(c, picture, tile, 0, set.tileWidth, set.tileHeight, (i % side) * cell, Math.floor(i / side) * cell, scale)
  })
  return canvas
}

/**
 * @param {string} text
 * @param {(name: string) => Promise<string | null>} readTileset
 */
async function tilemapThumb(text, readTileset) {
  const map = parseTilemap(text)
  if (!map) return null
  const tilesetText = await readTileset(map.tileset)
  const set = tilesetText === null ? null : parseTileset(tilesetText)
  const [canvas, c] = blank()
  c.imageSmoothingEnabled = false
  if (!set) return canvas
  // The start of the map, big enough to recognize.
  const across = Math.min(map.width, 12)
  const down = Math.min(map.height, 12)
  const fit = SIZE / Math.max(across * set.tileWidth, down * set.tileHeight)
  const pictures = new Map(set.tiles.map((t) => [t.key, { tile: t, picture: frameCanvas(set, t, t.frames[0]) }]))
  for (const layer of map.layers) {
    if (!layer.visible) continue
    const firstRow = Math.max(0, map.height - down)
    for (let r = firstRow; r < map.height; r++) {
      for (let col = 0; col < across; col++) {
        const entry = pictures.get(layer.rows[r][col])
        if (!entry) continue
        const mask = entry.tile.kind === 'terrain'
          ? terrainMask((x, y) => x < 0 || y < 0 || x >= map.width || y >= map.height || layer.rows[y][x] === layer.rows[r][col], col, r)
          : 0
        drawCell(c, entry.picture, entry.tile, mask, set.tileWidth, set.tileHeight, col * set.tileWidth * fit, (r - firstRow) * set.tileHeight * fit, fit)
      }
    }
  }
  return canvas
}

/** @param {string} text */
function particlesThumb(text) {
  const fx = parseParticles(text)
  if (!fx) return null
  const [canvas, c] = blank()
  c.fillStyle = '#101218'
  c.fillRect(0, 0, SIZE, SIZE)
  const count = 16
  for (let i = 0; i < count; i++) {
    // The same scatter every time, so the picture only changes with the effect.
    const angle = i * 2.399963
    const distance = Math.sqrt((i + 1) / count) * 15
    c.fillStyle = fx.colors[i % fx.colors.length]
    const s = fx.shape === 'spark' ? 1 : Math.max(1.5, fx.size[0] * 0.6)
    c.beginPath()
    c.arc(18 + Math.cos(angle) * distance, 18 + Math.sin(angle) * distance, s, 0, Math.PI * 2)
    c.fill()
  }
  return canvas
}

/** @param {Float32Array} samples @param {string} color */
function waveThumb(samples, color) {
  const [canvas, c] = blank()
  c.fillStyle = color
  const step = samples.length / SIZE
  for (let x = 0; x < SIZE; x++) {
    let peak = 0
    const end = Math.min(samples.length, Math.floor((x + 1) * step))
    for (let i = Math.floor(x * step); i < end; i += 4) peak = Math.max(peak, Math.abs(samples[i]))
    const height = Math.max(1, peak * 30)
    c.fillRect(x, 18 - height / 2, 1, height)
  }
  return canvas
}

/** @param {string} text */
function soundThumb(text) {
  const sound = parseSoundFile(text)
  return sound ? waveThumb(renderSound(sound, 11025), '#c9a227') : null
}

/** @param {string} text */
function musicThumb(text) {
  const song = parseSong(text)
  if (!song) return null
  const [canvas, c] = blank()
  const notes = song.tracks.filter((t) => t.wave !== 'drums').flatMap((t) => t.notes)
  if (notes.length === 0) return canvas
  const low = Math.min(...notes.map((n) => n[1]))
  const high = Math.max(...notes.map((n) => n[1]))
  c.fillStyle = '#c9a227'
  for (const [step, note, length] of notes) {
    const x = (step / song.steps) * SIZE
    const y = SIZE - 4 - ((note - low) / Math.max(1, high - low)) * (SIZE - 8)
    c.fillRect(x, y, Math.max(1.5, (length / song.steps) * SIZE), 2)
  }
  return canvas
}

/**
 * A picture for a file, as a data URL, or null.
 * @param {string} path
 * @param {ProjectFs} fs
 * @returns {Promise<string | null>}
 */
export async function fileThumb(path, fs) {
  const kind = visualKind(path)
  if (!kind) return null
  try {
    const text = await fs.readText(path)
    /** @param {string} name */
    const readTileset = async (name) => {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : ''
      for (const candidate of [`${dir}${name}`, name]) {
        if (await fs.exists(candidate).catch(() => false)) return fs.readText(candidate)
      }
      return null
    }
    /** @type {HTMLCanvasElement | null} */
    let canvas = null
    if (kind === 'tileset') canvas = tilesetThumb(text)
    else if (kind === 'tilemap') canvas = await tilemapThumb(text, readTileset)
    else if (kind === 'particles') canvas = particlesThumb(text)
    else if (kind === 'sound') canvas = soundThumb(text)
    else canvas = musicThumb(text)
    return canvas ? canvas.toDataURL() : null
  } catch {
    return null
  }
}

