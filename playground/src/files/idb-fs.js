// Projects kept in this browser (IndexedDB). Works offline and everywhere,
// but only in this browser profile: export or open a disk folder to keep files elsewhere.

import { request, transaction } from './idb.js'
import { basename, dirname, isInside, mimeType, normalize } from './paths.js'
import { FsError, sortEntries } from './project.js'

/** @import { Entry, ProjectFs } from './project.js' */

/**
 * @typedef {object} ProjectRecord
 * @property {string} id
 * @property {string} name
 * @property {number} created
 * @property {number} updated
 */

/** @returns {Promise<ProjectRecord[]>} newest first */
export async function listBrowserProjects() {
  const all = await transaction('projects', 'readonly', (tx) => request(tx.objectStore('projects').getAll()))
  return /** @type {ProjectRecord[]} */ (all).sort((a, b) => b.updated - a.updated)
}

/**
 * @param {string} name
 * @param {Record<string, string | Blob>} [files={}]
 * @returns {Promise<IdbFs>}
 */
export async function createBrowserProject(name, files = {}) {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const now = Date.now()
  await transaction(['projects', 'files'], 'readwrite', (tx) => {
    tx.objectStore('projects').put({ id, name, created: now, updated: now })
    const store = tx.objectStore('files')
    /** @type {Set<string>} */
    const dirs = new Set()
    for (const [raw, data] of Object.entries(files)) {
      const path = normalize(raw)
      for (let d = dirname(path); d !== ''; d = dirname(d)) dirs.add(d)
      store.put({ project: id, path, kind: 'file', data })
    }
    for (const path of dirs) store.put({ project: id, path, kind: 'dir' })
  })
  return new IdbFs(id, name)
}

/** @param {string} id */
export async function deleteBrowserProject(id) {
  await transaction(['projects', 'files'], 'readwrite', async (tx) => {
    tx.objectStore('projects').delete(id)
    const files = tx.objectStore('files')
    const keys = await request(files.index('project').getAllKeys(id))
    for (const key of keys) files.delete(key)
  })
}

/**
 * @param {string} id
 * @param {string} name
 */
export async function renameBrowserProject(id, name) {
  await transaction('projects', 'readwrite', async (tx) => {
    const store = tx.objectStore('projects')
    const record = await request(store.get(id))
    if (record) store.put({ ...record, name, updated: Date.now() })
  })
}

/** @implements {ProjectFs} */
export class IdbFs {
  type = /** @type {const} */ ('browser')
  readOnly = false

  /**
   * @param {string} projectId
   * @param {string} name
   */
  constructor(projectId, name) {
    this.id = `browser:${projectId}`
    this.projectId = projectId
    this.name = name
  }

  /** @returns {Promise<Array<{ project: string; path: string; kind: 'file' | 'dir'; data?: string | Blob }>>} */
  async rows() {
    return transaction('files', 'readonly', (tx) =>
      request(tx.objectStore('files').index('project').getAll(this.projectId)),
    )
  }

  /** @param {string} path */
  async row(path) {
    return transaction('files', 'readonly', (tx) =>
      request(tx.objectStore('files').get([this.projectId, normalize(path)])),
    )
  }

  async list() {
    /** @type {Entry[]} */
    const entries = (await this.rows()).map((r) => ({ path: r.path, kind: r.kind }))
    return sortEntries(entries)
  }

  /** @param {string} path */
  async readBlob(path) {
    const row = await this.row(path)
    if (!row || row.kind !== 'file') throw new FsError(`I can't find "${normalize(path)}".`)
    const data = row.data ?? ''
    return typeof data === 'string' ? new Blob([data], { type: mimeType(path) }) : data
  }

  /** @param {string} path */
  async readText(path) {
    const row = await this.row(path)
    if (!row || row.kind !== 'file') throw new FsError(`I can't find "${normalize(path)}".`)
    const data = row.data ?? ''
    return typeof data === 'string' ? data : data.text()
  }

  /**
   * @param {string} path
   * @param {string | Blob} data
   */
  async write(path, data) {
    const p = normalize(path)
    if (p === '') throw new FsError('A file needs a name.')
    await transaction(['files', 'projects'], 'readwrite', async (tx) => {
      const store = tx.objectStore('files')
      const existing = await request(store.get([this.projectId, p]))
      if (existing && existing.kind === 'dir') throw new FsError(`"${basename(p)}" is a folder.`)
      for (let d = dirname(p); d !== ''; d = dirname(d)) {
        const parent = await request(store.get([this.projectId, d]))
        if (parent && parent.kind === 'file') throw new FsError(`"${basename(d)}" is a file, not a folder.`)
        if (!parent) store.put({ project: this.projectId, path: d, kind: 'dir' })
      }
      store.put({ project: this.projectId, path: p, kind: 'file', data })
      this.touch(tx)
    })
  }

  /** @param {IDBTransaction} tx */
  touch(tx) {
    const projects = tx.objectStore('projects')
    const get = projects.get(this.projectId)
    get.onsuccess = () => {
      if (get.result) projects.put({ ...get.result, updated: Date.now() })
    }
  }

  /**
   * @param {string} path
   * @param {string} text
   */
  writeText(path, text) {
    return this.write(path, text)
  }

  /**
   * @param {string} path
   * @param {Blob} blob
   */
  writeBlob(path, blob) {
    return this.write(path, blob)
  }

  /** @param {string} path */
  async mkdir(path) {
    const p = normalize(path)
    if (p === '') return
    await transaction('files', 'readwrite', async (tx) => {
      const store = tx.objectStore('files')
      for (let d = p; d !== ''; d = dirname(d)) {
        const existing = await request(store.get([this.projectId, d]))
        if (existing && existing.kind === 'file') throw new FsError(`There is already a file called "${basename(d)}".`)
        if (!existing) store.put({ project: this.projectId, path: d, kind: 'dir' })
      }
    })
  }

  /**
   * @param {string} from
   * @param {string} to
   */
  async rename(from, to) {
    const a = normalize(from)
    const b = normalize(to)
    if (a === b) return
    if (isInside(b, a)) throw new FsError('A folder can\'t go inside itself.')
    const rows = await this.rows()
    if (!rows.some((r) => r.path === a)) throw new FsError(`I can't find "${a}".`)
    if (rows.some((r) => r.path === b)) throw new FsError(`There is already something called "${basename(b)}" there.`)
    await transaction(['files', 'projects'], 'readwrite', (tx) => {
      const store = tx.objectStore('files')
      for (const r of rows) {
        if (!isInside(r.path, a)) continue
        store.delete([this.projectId, r.path])
        store.put({ ...r, path: b + r.path.slice(a.length) })
      }
      const have = new Set(rows.map((r) => r.path))
      for (let d = dirname(b); d !== ''; d = dirname(d)) {
        if (!have.has(d)) store.put({ project: this.projectId, path: d, kind: 'dir' })
      }
      this.touch(tx)
    })
  }

  /** @param {string} path */
  async remove(path) {
    const p = normalize(path)
    const rows = await this.rows()
    if (!rows.some((r) => r.path === p)) throw new FsError(`I can't find "${p}".`)
    await transaction(['files', 'projects'], 'readwrite', (tx) => {
      const store = tx.objectStore('files')
      for (const r of rows) if (isInside(r.path, p)) store.delete([this.projectId, r.path])
      this.touch(tx)
    })
  }

  /** @param {string} path */
  async exists(path) {
    const p = normalize(path)
    return p === '' || (await this.row(p)) !== undefined
  }
}
