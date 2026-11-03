// Which files open in a picture editor instead of as text, and what a new one starts as.
// The editors themselves load only when first opened, so Studio stays quick.

import { DEFAULT_PARTICLES, DEFAULT_SOUND, PARTICLE_PRESETS, SOUND_PRESETS } from '@minijs/lang'
import { stringifyAsset } from '@minijs/runtime'
import { newTilesetText, starterTilemap } from './starter-tiles.js'

/** @import { ProjectFs } from '../files/project.js' */

/**
 * What an editor can ask Studio to do.
 * @typedef {object} ToolContext
 * @property {string} path
 * @property {ProjectFs} fs
 * @property {boolean} readOnly
 * @property {(text: string) => void} save Save soon, and restart the game if it uses this file.
 * @property {(line: string) => Promise<void>} addToGame Put a line like `sound coin "coin.sound"` in the game file.
 * @property {(line: string) => Promise<boolean>} gameHasLine
 * @property {() => string | null} runPath The game file that is running.
 * @property {() => Promise<string[]>} gameThingNames The things in that game, for placing on maps.
 * @property {(extension: string) => Promise<string[]>} filesOfKind Project files ending in this extension.
 * @property {(path: string) => void} openFile
 * @property {(path: string) => string} usableName What a game calls this file.
 * @property {(message: string) => void} toast
 * @property {(blob: Blob, name: string) => Promise<void>} saveFile
 * @property {() => import('@minijs/runtime').Game | null} game
 */

/**
 * @typedef {object} Tool
 * @property {() => void} destroy
 */

/** @typedef {'tileset' | 'tilemap' | 'particles' | 'sound' | 'music'} VisualKind */

/** @type {Record<VisualKind, { title: string; icon: string; blurb: string; base: string }>} */
export const VISUAL_KINDS = {
  tilemap: { title: 'Tile map', icon: 'map-trifold', blurb: 'Paint a level with tiles', base: 'level' },
  tileset: { title: 'Tile set', icon: 'grid-four', blurb: 'Draw the tiles for your levels', base: 'tiles' },
  particles: { title: 'Particle effect', icon: 'sparkle', blurb: 'Sparkles, smoke, fire and more', base: 'sparkle' },
  sound: { title: 'Sound', icon: 'speaker-high', blurb: 'Make a sound effect from sliders', base: 'coin' },
  music: { title: 'Music', icon: 'music-notes', blurb: 'Write a looping tune on a grid', base: 'theme' },
}

/**
 * The picture editor for a file, or null when it opens as text.
 * @param {string} path
 * @returns {VisualKind | null}
 */
export function visualKind(path) {
  const m = /\.(tileset|tilemap|particles|sound|music)$/i.exec(path)
  return m ? /** @type {VisualKind} */ (m[1].toLowerCase()) : null
}

/**
 * Start an editor inside `host`.
 * @param {VisualKind} kind
 * @param {HTMLElement} host
 * @param {string} text the file as saved
 * @param {ToolContext} ctx
 * @returns {Promise<Tool>}
 */
export async function openTool(kind, host, text, ctx) {
  switch (kind) {
    case 'tileset':
      return (await import('./tileset-tool.js')).openTilesetTool(host, text, ctx)
    case 'tilemap':
      return (await import('./tilemap-tool.js')).openTilemapTool(host, text, ctx)
    case 'particles':
      return (await import('./particles-tool.js')).openParticlesTool(host, text, ctx)
    case 'sound':
      return (await import('./sound-tool.js')).openSoundTool(host, text, ctx)
    case 'music':
      return (await import('./music-tool.js')).openMusicTool(host, text, ctx)
  }
}

/**
 * What a brand new file of this kind contains.
 * @param {VisualKind} kind
 * @param {{ tileset?: string }} [options]
 * @returns {string}
 */
export function newFileText(kind, options = {}) {
  switch (kind) {
    case 'tileset':
      return newTilesetText()
    case 'tilemap':
      return stringifyAsset(starterTilemap(options.tileset ?? 'tiles.tileset'))
    case 'particles':
      return stringifyAsset({ minijs: 'particles', version: 1, ...DEFAULT_PARTICLES, ...PARTICLE_PRESETS.sparkle })
    case 'sound':
      return stringifyAsset({ minijs: 'sound', version: 1, ...DEFAULT_SOUND, ...SOUND_PRESETS.coin })
    case 'music':
      return stringifyAsset(starterSong())
  }
}

/** A short friendly tune, so a new music file plays something right away. */
export function starterSong() {
  /** @type {Array<[number, number, number]>} */
  const melody = [[0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 76, 2], [8, 74, 2], [10, 76, 2], [12, 72, 4], [16, 72, 2], [18, 76, 2], [20, 79, 2], [22, 81, 2], [24, 79, 4], [28, 76, 4]]
  /** @type {Array<[number, number, number]>} */
  const bass = [[0, 48, 4], [8, 55, 4], [16, 45, 4], [24, 53, 4]]
  /** @type {Array<[number, number, number]>} */
  const drums = []
  for (let s = 0; s < 32; s += 8) drums.push([s, 0, 1], [s + 4, 1, 1])
  for (let s = 0; s < 32; s += 2) drums.push([s, 2, 1])
  return {
    minijs: 'music',
    version: 1,
    tempo: 124,
    steps: 32,
    scale: 'major-pentatonic',
    root: 60,
    tracks: [
      { name: 'Melody', wave: 'square', volume: 60, muted: false, notes: melody },
      { name: 'Bass', wave: 'triangle', volume: 85, muted: false, notes: bass },
      { name: 'Harmony', wave: 'sine', volume: 50, muted: false, notes: [] },
      { name: 'Drums', wave: 'drums', volume: 70, muted: false, notes: drums },
    ],
  }
}
