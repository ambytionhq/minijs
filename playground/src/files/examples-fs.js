// The built-in examples as a project. You can't add, rename or delete files
// here, but you can edit the games: edits are kept in this browser and
// "Reset" brings back the original. To change everything, copy it into a new project.

import { clearSource, loadSource, saveSource } from '../storage.js'
import { basename, extname, normalize } from './paths.js'
import { FsError, sortEntries } from './project.js'

/** @import { Entry, ProjectFs } from './project.js' */

/** @implements {ProjectFs} */
export class ExamplesFs {
  id = 'examples'
  name = 'Examples'
  type = /** @type {const} */ ('examples')
  readOnly = true

  /**
   * @param {Map<string, string>} games example name -> original source
   * @param {Map<string, string>} assets file name -> URL
   * @param {{ load: (key: string) => string | null; save: (key: string, text: string) => void; clear: (key: string) => void }} [edits]
   */
  constructor(games, assets, edits = { load: loadSource, save: saveSource, clear: clearSource }) {
    this.games = games
    this.assets = assets
    this.edits = edits
  }

  /** @param {string} path */
  gameName(path) {
    const p = normalize(path)
    return !p.includes('/') && extname(p) === 'mini' ? p.slice(0, -'.mini'.length) : null
  }

  async list() {
    /** @type {Entry[]} */
    const entries = [...this.games.keys()].map((name) => ({ path: `${name}.mini`, kind: 'file' }))
    if (this.assets.size > 0) entries.push({ path: 'assets', kind: 'dir' })
    for (const name of this.assets.keys()) entries.push({ path: `assets/${name}`, kind: 'file' })
    return sortEntries(entries)
  }

  /** The example as shipped, ignoring edits. @param {string} path */
  original(path) {
    const name = this.gameName(path)
    const text = name === null ? undefined : this.games.get(name)
    if (text === undefined) throw new FsError(`I can't find "${normalize(path)}".`)
    return text
  }

  /** @param {string} path */
  async readText(path) {
    const name = this.gameName(path)
    if (name !== null && this.games.has(name)) return this.edits.load(name) ?? this.original(path)
    return (await this.readBlob(path)).text()
  }

  /** @param {string} path */
  async readBlob(path) {
    const p = normalize(path)
    const name = this.gameName(p)
    if (name !== null && this.games.has(name)) return new Blob([await this.readText(p)], { type: 'text/plain' })
    const url = p.startsWith('assets/') ? this.assets.get(p.slice('assets/'.length)) : undefined
    if (url === undefined) throw new FsError(`I can't find "${p}".`)
    const response = await fetch(url)
    if (!response.ok) throw new FsError(`I couldn't load "${p}".`)
    return response.blob()
  }

  /**
   * Edits to an example game are kept in this browser.
   * @param {string} path
   * @param {string} text
   */
  async writeText(path, text) {
    const name = this.gameName(path)
    if (name === null || !this.games.has(name)) throw readOnly()
    if (text === this.original(path)) this.edits.clear(name)
    else this.edits.save(name, text)
  }

  /** @param {string} path */
  isEdited(path) {
    const name = this.gameName(path)
    return name !== null && this.edits.load(name) !== null
  }

  /** @param {string} path */
  async reset(path) {
    const name = this.gameName(path)
    if (name !== null) this.edits.clear(name)
  }

  async writeBlob() {
    throw readOnly()
  }

  async mkdir() {
    throw readOnly()
  }

  async rename() {
    throw readOnly()
  }

  async remove() {
    throw readOnly()
  }

  /** @param {string} path */
  async exists(path) {
    const p = normalize(path)
    if (p === '' || p === 'assets') return true
    const name = this.gameName(p)
    if (name !== null) return this.games.has(name)
    return p.startsWith('assets/') && this.assets.has(basename(p))
  }

  /** Every file, for "Copy to my projects". */
  async snapshot() {
    /** @type {Record<string, string | Blob>} */
    const files = {}
    for (const entry of await this.list()) {
      if (entry.kind !== 'file') continue
      files[entry.path] = this.gameName(entry.path) !== null ? await this.readText(entry.path) : await this.readBlob(entry.path)
    }
    return files
  }
}

function readOnly() {
  return new FsError('Examples can\'t be changed like that. Copy it to your projects first.')
}
