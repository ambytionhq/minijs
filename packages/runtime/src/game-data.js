// The files a game names besides pictures: tilemaps and tilesets, sounds, music and
// particle effects. All loaded before the game starts. A missing or broken file never
// stops the game: it gets a clear message, and the game runs without that part.

/** @import { Loc, MiniError, ParticleSettings, Program, SoundSettings } from '@minijs/lang' */
/** @import { AssetLoader } from './assets.js' */
/** @import { Tilemap, Tileset, TileAtlas } from './tiles/format.js' */
/** @import { Song } from './audio/synth.js' */
import { DEFAULT_PARTICLES, DEFAULT_SOUND, PARTICLE_PRESETS, SOUND_PRESETS, miniError } from '@minijs/lang'
import { parseSong } from './audio/synth.js'
import { buildAtlas, parseTilemap, parseTileset } from './tiles/format.js'

/**
 * @typedef {object} LoadedSound
 * @property {Partial<SoundSettings> | null} samples Settings to make it from.
 * @property {ArrayBuffer | null} bytes An audio file to decode.
 * @property {() => MiniError} problem The message when that file can't be played.
 */

/**
 * @typedef {object} LoadedMusic
 * @property {Song | null} song
 * @property {ArrayBuffer | null} bytes
 * @property {number} volume
 * @property {() => MiniError} problem
 */

/**
 * @typedef {object} GameData
 * @property {Map<string, { map: Tilemap; tileset: Tileset; atlas: TileAtlas; baseId: number }>} tilemaps
 * @property {Map<string, LoadedSound>} sounds
 * @property {Map<string, LoadedMusic>} music
 * @property {Map<string, ParticleSettings>} particles
 * @property {Array<{ tileset: Tileset; atlas: TileAtlas; baseId: number }>} tilesets
 */

/** @returns {GameData} */
export function emptyGameData() {
  return { tilemaps: new Map(), sounds: new Map(), music: new Map(), particles: new Map(), tilesets: [] }
}

/** @param {string} src */
const isSynthSound = (src) => src.toLowerCase().endsWith('.sound')
/** @param {string} src */
const isSong = (src) => src.toLowerCase().endsWith('.music')

/**
 * Read a .particles file.
 * @param {string} text
 * @returns {ParticleSettings | null}
 */
export function parseParticles(text) {
  /** @type {any} */
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || raw.minijs !== 'particles') return null
  return cleanParticles(raw)
}

/**
 * @param {any} raw
 * @returns {ParticleSettings}
 */
function cleanParticles(raw) {
  const d = DEFAULT_PARTICLES
  /** @param {unknown} v @param {[number, number]} fallback @returns {[number, number]} */
  const range = (v, fallback) =>
    Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number') ? [v[0], v[1]] : fallback
  /** @param {unknown} v @param {number} fallback */
  const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return {
    amount: Math.max(0, Math.round(num(raw.amount, d.amount))),
    rate: Math.max(0, num(raw.rate, d.rate)),
    life: range(raw.life, d.life),
    speed: range(raw.speed, d.speed),
    direction: num(raw.direction, d.direction),
    spread: num(raw.spread, d.spread),
    gravity: num(raw.gravity, d.gravity),
    drag: Math.max(0, Math.min(1, num(raw.drag, d.drag))),
    size: range(raw.size, d.size),
    colors: Array.isArray(raw.colors) && raw.colors.length > 0 ? raw.colors.filter((c) => typeof c === 'string') : d.colors,
    shape: raw.shape === 'circle' || raw.shape === 'spark' ? raw.shape : 'square',
    fade: raw.fade !== false,
    glow: raw.glow === true,
    area: range(raw.area, d.area),
  }
}

/**
 * Read a .sound file.
 * @param {string} text
 * @returns {SoundSettings | null}
 */
export function parseSoundFile(text) {
  /** @type {any} */
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!raw || raw.minijs !== 'sound') return null
  /** @type {any} */
  const out = { ...DEFAULT_SOUND }
  for (const key of Object.keys(DEFAULT_SOUND)) if (typeof raw[key] === typeof out[key]) out[key] = raw[key]
  if (out.pitch <= 0) out.pitch = DEFAULT_SOUND.pitch
  if (out.pitchEnd <= 0) out.pitchEnd = out.pitch
  return out
}

/**
 * @param {string} src
 * @param {Loc} loc
 * @returns {MiniError}
 */
function missing(src, loc) {
  return miniError(
    'file-missing',
    loc,
    `I couldn't find the file "${src}".`,
    'Check the spelling, and that the file is next to your game or in its assets folder.',
  )
}

/**
 * @param {string} src
 * @param {string} what
 * @param {Loc} loc
 * @returns {MiniError}
 */
function broken(src, what, loc) {
  return miniError('file-broken', loc, `"${src}" isn't a ${what} I can read.`, 'Open it in Studio to check it, or make it again.')
}

/**
 * @param {AssetLoader} loader
 * @param {string} src
 * @returns {Promise<string | null>}
 */
async function text(loader, src) {
  return loader.loadText ? loader.loadText(src) : null
}

/**
 * @param {AssetLoader} loader
 * @param {string} src
 * @returns {Promise<ArrayBuffer | null>}
 */
async function bytes(loader, src) {
  return loader.loadBytes ? loader.loadBytes(src) : null
}

/**
 * Load everything a program names besides its pictures.
 * @param {Program} program
 * @param {AssetLoader} loader
 * @returns {Promise<{ data: GameData; errors: MiniError[] }>}
 */
export async function loadGameData(program, loader) {
  const data = emptyGameData()
  /** @type {MiniError[]} */
  const errors = []
  /** @type {Map<string, { tileset: Tileset; atlas: TileAtlas; baseId: number } | null>} */
  const tilesets = new Map()
  let nextId = 0

  for (const decl of program.tilemaps ?? []) {
    const source = await text(loader, decl.src)
    if (source === null) {
      errors.push(missing(decl.src, decl.loc))
      continue
    }
    const map = parseTilemap(source)
    if (!map) {
      errors.push(broken(decl.src, 'tile map', decl.loc))
      continue
    }
    let entry = tilesets.get(map.tileset)
    if (entry === undefined) {
      const tilesetText = map.tileset === '' ? null : await text(loader, map.tileset)
      if (tilesetText === null) {
        errors.push(
          miniError(
            'file-missing',
            decl.loc,
            `The tile map "${decl.src}" needs the tile set "${map.tileset}", and I couldn't find it.`,
            'Open the tile map in Studio and pick a tile set.',
          ),
        )
        entry = null
      } else {
        const tileset = parseTileset(tilesetText)
        if (!tileset) {
          errors.push(broken(map.tileset, 'tile set', decl.loc))
          entry = null
        } else {
          entry = { tileset, atlas: buildAtlas(tileset), baseId: nextId }
          nextId += tileset.tiles.length
          data.tilesets.push(entry)
        }
      }
      tilesets.set(map.tileset, entry)
    }
    if (entry) data.tilemaps.set(decl.name, { map, tileset: entry.tileset, atlas: entry.atlas, baseId: entry.baseId })
  }

  for (const decl of program.sounds ?? []) {
    const problem = () => broken(decl.src ?? '', 'sound file', decl.loc)
    if (decl.src === null) {
      const base = decl.preset ? SOUND_PRESETS[decl.preset] : DEFAULT_SOUND
      data.sounds.set(decl.name, { samples: { ...base, ...decl.settings }, bytes: null, problem })
    } else if (isSynthSound(decl.src)) {
      const source = await text(loader, decl.src)
      if (source === null) {
        errors.push(missing(decl.src, decl.loc))
        continue
      }
      const settings = parseSoundFile(source)
      if (settings) data.sounds.set(decl.name, { samples: { ...settings, ...decl.settings }, bytes: null, problem })
      else errors.push(problem())
    } else {
      const audio = await bytes(loader, decl.src)
      if (audio === null) errors.push(missing(decl.src, decl.loc))
      else data.sounds.set(decl.name, { samples: null, bytes: audio, problem })
    }
  }

  for (const decl of program.music ?? []) {
    const problem = () => broken(decl.src, 'music file', decl.loc)
    if (isSong(decl.src)) {
      const source = await text(loader, decl.src)
      if (source === null) {
        errors.push(missing(decl.src, decl.loc))
        continue
      }
      const song = parseSong(source)
      if (song) data.music.set(decl.name, { song, bytes: null, volume: decl.volume, problem })
      else errors.push(problem())
    } else {
      const audio = await bytes(loader, decl.src)
      if (audio === null) errors.push(missing(decl.src, decl.loc))
      else data.music.set(decl.name, { song: null, bytes: audio, volume: decl.volume, problem })
    }
  }

  for (const decl of program.particles ?? []) {
    if (decl.src === null) {
      const base = decl.preset ? PARTICLE_PRESETS[decl.preset] : DEFAULT_PARTICLES
      data.particles.set(decl.name, { ...base, ...decl.settings })
      continue
    }
    const source = await text(loader, decl.src)
    if (source === null) {
      errors.push(missing(decl.src, decl.loc))
      data.particles.set(decl.name, { ...DEFAULT_PARTICLES, ...decl.settings })
      continue
    }
    const settings = parseParticles(source)
    if (!settings) errors.push(broken(decl.src, 'particle effect', decl.loc))
    data.particles.set(decl.name, { ...(settings ?? DEFAULT_PARTICLES), ...decl.settings })
  }
  return { data, errors }
}

/**
 * Every file a program needs besides pictures, for exports and share codes. Tile sets
 * are named inside tile maps, so this reads the tile maps through `readText`.
 * @param {Program} program
 * @param {(src: string) => Promise<string | null>} readText
 * @returns {Promise<Array<{ src: string; binary: boolean }>>}
 */
export async function collectGameFiles(program, readText) {
  /** @type {Map<string, boolean>} */
  const out = new Map()
  for (const decl of program.tilemaps ?? []) {
    out.set(decl.src, false)
    const source = await readText(decl.src)
    const map = source === null ? null : parseTilemap(source)
    if (map && map.tileset !== '') out.set(map.tileset, false)
  }
  for (const decl of program.sounds ?? []) if (decl.src !== null) out.set(decl.src, !isSynthSound(decl.src))
  for (const decl of program.music ?? []) out.set(decl.src, !isSong(decl.src))
  for (const decl of program.particles ?? []) if (decl.src !== null) out.set(decl.src, false)
  return [...out].map(([src, binary]) => ({ src, binary }))
}
