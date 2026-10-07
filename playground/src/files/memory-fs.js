// In-memory project. Used by tests, and as the base for other stores.

import { FsError, sortEntries } from './project.js'
import { basename, dirname, isInside, mimeType, normalize } from './paths.js'

/** @import { Entry, ProjectFs } from './project.js' */

/** @implements {ProjectFs} */
export class MemoryFs {
  type = /** @type {const} */ ('memory')
  readOnly = false

  /**
   * @param {string} name
   * @param {Record<string, string | Blob>} [files={}]
   */
  constructor(name, files = {}) {
    this.id = `memory:${name}`
    this.name = name
    /** @type {Map<string, string | Blob>} */
    this.files = new Map()
    /** @type {Set<string>} */
    this.dirs = new Set()
    for (const [path, data] of Object.entries(files)) this.put(normalize(path), data)
  }

  /**
   * @param {string} path
   * @param {string | Blob} data
   */
  put(path, data) {
    if (this.dirs.has(path)) throw new FsError(`"${basename(path)}" is a folder.`)
    this.addParents(path)
    this.files.set(path, data)
  }

  /** @param {string} path */
  addParents(path) {
    for (let d = dirname(path); d !== ''; d = dirname(d)) {
      if (this.files.has(d)) throw new FsError(`"${basename(d)}" is a file, not a folder.`)
      this.dirs.add(d)
    }
  }

  /** @param {string} path */
  get(path) {
    const data = this.files.get(normalize(path))
    if (data === undefined) throw new FsError(`I can't find "${normalize(path)}".`)
    return data
  }

  async list() {
    /** @type {Entry[]} */
    const entries = [...this.dirs].map((path) => ({ path, kind: 'dir' }))
    for (const path of this.files.keys()) entries.push({ path, kind: 'file' })
    return sortEntries(entries)
  }

  /** @param {string} path */
  async readText(path) {
    const data = this.get(path)
    return typeof data === 'string' ? data : data.text()
  }

  /** @param {string} path */
  async readBlob(path) {
    const data = this.get(path)
    return typeof data === 'string' ? new Blob([data], { type: mimeType(path) }) : data
  }

  /**
   * @param {string} path
   * @param {string} text
   */
  async writeText(path, text) {
    this.put(normalize(path), text)
  }

  /**
   * @param {string} path
   * @param {Blob} blob
   */
  async writeBlob(path, blob) {
    this.put(normalize(path), blob)
  }

  /** @param {string} path */
  async mkdir(path) {
    const p = normalize(path)
    if (p === '') return
    if (this.files.has(p)) throw new FsError(`There is already a file called "${basename(p)}".`)
    this.addParents(p)
    this.dirs.add(p)
  }

  /**
   * @param {string} from
   * @param {string} to
   */
  async rename(from, to) {
    const a = normalize(from)
    const b = normalize(to)
    if (a === b) return
    if (!(await this.exists(a))) throw new FsError(`I can't find "${a}".`)
    if (await this.exists(b)) throw new FsError(`There is already something called "${basename(b)}" there.`)
    if (isInside(b, a)) throw new FsError('A folder can\'t go inside itself.')
    /** @param {string} p */
    const moved = (p) => b + p.slice(a.length)
    for (const [path, data] of [...this.files]) {
      if (!isInside(path, a)) continue
      this.files.delete(path)
      this.put(moved(path), data)
    }
    for (const dir of [...this.dirs]) {
      if (!isInside(dir, a)) continue
      this.dirs.delete(dir)
      this.dirs.add(moved(dir))
    }
    this.addParents(b)
  }

  /** @param {string} path */
  async remove(path) {
    const p = normalize(path)
    if (!(await this.exists(p))) throw new FsError(`I can't find "${p}".`)
    for (const f of [...this.files.keys()]) if (isInside(f, p)) this.files.delete(f)
    for (const d of [...this.dirs]) if (isInside(d, p)) this.dirs.delete(d)
  }

  /** @param {string} path */
  async exists(path) {
    const p = normalize(path)
    return p === '' || this.files.has(p) || this.dirs.has(p)
  }

  /** Copy every file into a plain object (for copying between stores). */
  async snapshot() {
    return Object.fromEntries(this.files)
  }
}

