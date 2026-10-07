// A built-in example as a project. You can't add, rename or delete files here,
// but you can edit the games: edits are kept in this browser and "Reset" brings
// back the original. To change everything, copy it into a new project.

import { clearSource, loadSource, saveSource } from '../storage.js'
import { basename, normalize } from './paths.js'
import { FsError, sortEntries } from './project.js'

/** @import { Entry, ProjectFs } from './project.js' */

/**
 * @typedef {object} ExampleOptions
 * @property {string} id e.g. "example:cloud-hopper"
 * @property {string} name shown to people
 * @property {Map<string, string>} texts project path -> original text (".mini" and other text files)
 * @property {Map<string, string>} assets file name in assets/ -> URL
 * @property {{ load: (key: string) => string | null; save: (key: string, text: string) => void; clear: (key: string) => void }} [edits]
 */

/** @implements {ProjectFs} */
export class ExamplesFs {
  type = /** @type {const} */ ('examples')
  readOnly = true

  /** @param {ExampleOptions} options */
  constructor(options) {
    this.id = options.id
    this.name = options.name
    this.texts = options.texts
    this.assets = options.assets
    this.edits = options.edits ?? { load: loadSource, save: saveSource, clear: clearSource }
  }

  /** @param {string} path */
  editKey(path) {
    return `${this.id}/${normalize(path)}`
  }

  async list() {
    /** @type {Entry[]} */
    const entries = [...this.texts.keys()].map((path) => ({ path, kind: 'file' }))
    if (this.assets.size > 0) entries.push({ path: 'assets', kind: 'dir' })
    for (const name of this.assets.keys()) entries.push({ path: `assets/${name}`, kind: 'file' })
    return sortEntries(entries)
  }

  /** The text as shipped, ignoring edits. @param {string} path */
  original(path) {
    const text = this.texts.get(normalize(path))
    if (text === undefined) throw new FsError(`I can't find "${normalize(path)}".`)
    return text
  }

  /** @param {string} path */
  async readText(path) {
    const p = normalize(path)
    if (this.texts.has(p)) return this.edits.load(this.editKey(p)) ?? this.original(p)
    return (await this.readBlob(p)).text()
  }

  /** @param {string} path */
  async readBlob(path) {
    const p = normalize(path)
    if (this.texts.has(p)) return new Blob([await this.readText(p)], { type: 'text/plain' })
    const url = p.startsWith('assets/') ? this.assets.get(p.slice('assets/'.length)) : undefined
    if (url === undefined) throw new FsError(`I can't find "${p}".`)
    const response = await fetch(url)
    if (!response.ok) throw new FsError(`I couldn't load "${p}".`)
    return response.blob()
  }

  /**
   * Edits to an example's text files are kept in this browser.
   * @param {string} path
   * @param {string} text
   */
  async writeText(path, text) {
    const p = normalize(path)
    if (!this.texts.has(p)) throw readOnly()
    if (text === this.original(p)) this.edits.clear(this.editKey(p))
    else this.edits.save(this.editKey(p), text)
  }

  /** @param {string} path */
  isEdited(path) {
    const p = normalize(path)
    return this.texts.has(p) && this.edits.load(this.editKey(p)) !== null
  }

  /** @param {string} path */
  async reset(path) {
    this.edits.clear(this.editKey(path))
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
    if (p === '' || (p === 'assets' && this.assets.size > 0)) return true
    if (this.texts.has(p)) return true
    return p.startsWith('assets/') && this.assets.has(basename(p))
  }

  /** Every file with edits applied, for "Copy to my projects", share links and exports. */
  async snapshot() {
    /** @type {Record<string, string | Blob>} */
    const files = {}
    for (const entry of await this.list()) {
      if (entry.kind !== 'file') continue
      files[entry.path] = this.texts.has(entry.path) ? await this.readText(entry.path) : await this.readBlob(entry.path)
    }
    return files
  }
}

function readOnly() {
  return new FsError('Examples can\'t be changed like that. Make a copy first.')
}
