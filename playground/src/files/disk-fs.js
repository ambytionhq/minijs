// Real folders on this computer, through the browser's folder access
// (Chrome, Edge, Opera, and other Chromium browsers). Every save goes
// straight to the file on disk, so other editors and git see it.

import { request, transaction } from './idb.js'
import { basename, dirname, isInside, normalize } from './paths.js'
import { FsError, sortEntries } from './project.js'

/** @import { Entry, ProjectFs } from './project.js' */

/** Folders that are never worth showing in a game project. */
const SKIP = new Set(['node_modules', '.git', '.svn', '.hg', '.DS_Store', 'dist', '.vite', '.cache'])
/** Stop listing huge folders. */
const MAX_ENTRIES = 3000

/** True when this browser can open folders from disk. */
export function canOpenFolders() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/**
 * Ask the person to pick a folder. Resolves null if they cancel.
 * @returns {Promise<DiskFs | null>}
 */
export async function pickFolder() {
  try {
    const handle = await /** @type {any} */ (window).showDirectoryPicker({ mode: 'readwrite', id: 'minijs' })
    const fs = new DiskFs(handle, `disk:${Date.now().toString(36)}`)
    await rememberFolder(fs)
    return fs
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

/** @param {DiskFs} fs */
async function rememberFolder(fs) {
  await transaction('handles', 'readwrite', async (tx) => {
    const store = tx.objectStore('handles')
    // Re-picking the same folder replaces the old entry instead of listing it twice.
    const all = /** @type {Array<{ id: string; handle: FileSystemDirectoryHandle }>} */ (await request(store.getAll()))
    for (const old of all) {
      if (await old.handle.isSameEntry(fs.handle)) {
        fs.id = old.id
        store.delete(old.id)
      }
    }
    store.put({ id: fs.id, name: fs.name, handle: fs.handle })
  })
}

/** @returns {Promise<DiskFs[]>} folders opened before, not yet checked for permission */
export async function rememberedFolders() {
  const rows = await transaction('handles', 'readonly', (tx) => request(tx.objectStore('handles').getAll()))
  return /** @type {Array<{ id: string; handle: FileSystemDirectoryHandle }>} */ (rows).map(
    (r) => new DiskFs(r.handle, r.id),
  )
}

/** @param {string} id */
export async function forgetFolder(id) {
  await transaction('handles', 'readwrite', (tx) => {
    tx.objectStore('handles').delete(id)
  })
}

/** @implements {ProjectFs} */
export class DiskFs {
  type = /** @type {const} */ ('disk')
  readOnly = false

  /**
   * @param {FileSystemDirectoryHandle} handle
   * @param {string} id
   */
  constructor(handle, id) {
    this.handle = handle
    this.id = id
    this.name = handle.name
  }

  /**
   * Browsers ask again for access after a reload. Must run from a click.
   * @returns {Promise<boolean>}
   */
  async ensureAccess() {
    const h = /** @type {any} */ (this.handle)
    if (typeof h.queryPermission !== 'function') return true
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
  }

  /**
   * Folder handle for a path, optionally creating it.
   * @param {string} path
   * @param {boolean} create
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async dir(path, create) {
    let h = this.handle
    for (const part of normalize(path).split('/').filter(Boolean)) {
      try {
        h = await h.getDirectoryHandle(part, { create })
      } catch (error) {
        throw toFsError(error, path)
      }
    }
    return h
  }

  /**
   * @param {string} path
   * @param {boolean} create
   * @returns {Promise<FileSystemFileHandle>}
   */
  async file(path, create) {
    const p = normalize(path)
    const parent = await this.dir(dirname(p), create)
    try {
      return await parent.getFileHandle(basename(p), { create })
    } catch (error) {
      throw toFsError(error, p)
    }
  }

  async list() {
    /** @type {Entry[]} */
    const entries = []
    /**
     * @param {FileSystemDirectoryHandle} dir
     * @param {string} prefix
     */
    const walk = async (dir, prefix) => {
      for await (const [name, child] of /** @type {any} */ (dir).entries()) {
        if (entries.length >= MAX_ENTRIES) return
        if (SKIP.has(name) || name.startsWith('.')) continue
        const path = prefix === '' ? name : `${prefix}/${name}`
        if (child.kind === 'directory') {
          entries.push({ path, kind: 'dir' })
          await walk(child, path)
        } else {
          entries.push({ path, kind: 'file' })
        }
      }
    }
    await walk(this.handle, '')
    return sortEntries(entries)
  }

  /** @param {string} path */
  async readBlob(path) {
    return (await this.file(path, false)).getFile()
  }

  /** @param {string} path */
  async readText(path) {
    return (await this.readBlob(path)).text()
  }

  /**
   * @param {string} path
   * @param {string | Blob} data
   */
  async write(path, data) {
    if (normalize(path) === '') throw new FsError('A file needs a name.')
    const handle = await this.file(path, true)
    const writable = await /** @type {any} */ (handle).createWritable()
    await writable.write(data)
    await writable.close()
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
    await this.dir(path, true)
  }

  /**
   * Copy then delete: works in every browser that can open folders.
   * @param {string} from
   * @param {string} to
   */
  async rename(from, to) {
    const a = normalize(from)
    const b = normalize(to)
    if (a === b) return
    if (isInside(b, a)) throw new FsError('A folder can\'t go inside itself.')
    if (!(await this.exists(a))) throw new FsError(`I can't find "${a}".`)
    if (await this.exists(b)) throw new FsError(`There is already something called "${basename(b)}" there.`)
    const kind = await this.kindOf(a)
    if (kind === 'file') {
      await this.write(b, await this.readBlob(a))
    } else {
      await this.mkdir(b)
      for (const entry of await this.listUnder(a)) {
        const target = b + entry.path.slice(a.length)
        if (entry.kind === 'dir') await this.mkdir(target)
        else await this.write(target, await this.readBlob(entry.path))
      }
    }
    await this.remove(a)
  }

  /** @param {string} dir */
  async listUnder(dir) {
    return (await this.list()).filter((e) => e.path !== dir && isInside(e.path, dir))
  }

  /** @param {string} path */
  async remove(path) {
    const p = normalize(path)
    if (p === '') throw new FsError('I won\'t delete the whole project folder.')
    const parent = await this.dir(dirname(p), false)
    try {
      await parent.removeEntry(basename(p), { recursive: true })
    } catch (error) {
      throw toFsError(error, p)
    }
  }

  /**
   * @param {string} path
   * @returns {Promise<'file' | 'dir' | null>}
   */
  async kindOf(path) {
    const p = normalize(path)
    if (p === '') return 'dir'
    let parent
    try {
      parent = await this.dir(dirname(p), false)
    } catch {
      return null
    }
    const name = basename(p)
    try {
      await parent.getFileHandle(name)
      return 'file'
    } catch {
      // not a file
    }
    try {
      await parent.getDirectoryHandle(name)
      return 'dir'
    } catch {
      return null
    }
  }

  /** @param {string} path */
  async exists(path) {
    return (await this.kindOf(path)) !== null
  }
}

/**
 * Turn browser file errors into a sentence people can act on.
 * @param {unknown} error
 * @param {string} path
 */
function toFsError(error, path) {
  if (error instanceof FsError) return error
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotFoundError') return new FsError(`I can't find "${path}".`)
  if (name === 'TypeMismatchError') return new FsError(`"${basename(path)}" is a folder and a file at the same time.`)
  if (name === 'NotAllowedError') return new FsError('The browser did not allow access to this folder.')
  if (name === 'InvalidModificationError') return new FsError(`"${basename(path)}" is not empty.`)
  return new FsError(`Something went wrong with "${path}".`)
}
