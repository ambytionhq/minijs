// Real folders in the desktop app. Same rules as DiskFs (the browser's folder
// access), but through the app's own file access: no permission prompts after
// a restart, and folders opened from a double-clicked .mini file work too.
//
// The file calls go through a small `backend` with the same shape as
// @tauri-apps/plugin-fs, so tests can run the store against a real temporary
// folder with Node instead of the app.

import { loadSetting, saveSetting } from '../storage.js'
import { basename, isInside, normalize } from './paths.js'
import { FsError, sortEntries } from './project.js'

/** @import { Entry, ProjectFs } from './project.js' */

/**
 * @typedef {object} FsBackend
 * @property {(path: string) => Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean }>>} readDir
 * @property {(path: string) => Promise<Uint8Array>} readFile
 * @property {(path: string, data: Uint8Array) => Promise<void>} writeFile
 * @property {(path: string, options: { recursive: boolean }) => Promise<void>} mkdir
 * @property {(path: string, options: { recursive: boolean }) => Promise<void>} remove
 * @property {(from: string, to: string) => Promise<void>} rename
 * @property {(path: string) => Promise<boolean>} exists
 * @property {(path: string) => Promise<{ isFile: boolean; isDirectory: boolean }>} stat
 */

/**
 * @typedef {object} FolderRecord
 * @property {string} id "disk:..." from the folder's full path, so it stays the same
 * @property {string} path full path on this computer
 * @property {string} name
 */

/** Folders that are never worth showing in a game project. */
const SKIP = new Set(['node_modules', '.git', '.svn', '.hg', '.DS_Store', 'dist', '.vite', '.cache'])
/** Stop listing huge folders. */
const MAX_ENTRIES = 3000
/** Where the list of opened folders is kept (the app's own storage). */
const FOLDERS_KEY = 'desktop-folders'

/** @type {FsBackend | null} */
let defaultBackend = null

/** The app's file access, loaded the first time it is needed. */
async function appBackend() {
  if (!defaultBackend) {
    const fs = await import('@tauri-apps/plugin-fs')
    defaultBackend = {
      readDir: (path) => fs.readDir(path),
      readFile: (path) => fs.readFile(path),
      writeFile: (path, data) => fs.writeFile(path, data),
      mkdir: (path, options) => fs.mkdir(path, options),
      remove: (path, options) => fs.remove(path, options),
      rename: (from, to) => fs.rename(from, to),
      exists: (path) => fs.exists(path),
      stat: (path) => fs.stat(path),
    }
  }
  return defaultBackend
}

/**
 * Same id for the same folder every time.
 * @param {string} path
 */
export function folderId(path) {
  let hash = 2166136261
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `disk:${(hash >>> 0).toString(36)}`
}

/**
 * Last part of a full path, on any system.
 * @param {string} path
 */
export function lastPart(path) {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/**
 * The folder holding a file, on any system.
 * @param {string} path
 */
export function parentOf(path) {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i <= 0 ? path.slice(0, i + 1) : path.slice(0, i)
}

/** @returns {FolderRecord[]} newest first */
export function folderRecords() {
  try {
    const list = JSON.parse(loadSetting(FOLDERS_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((r) => r && typeof r.path === 'string') : []
  } catch {
    return []
  }
}

/**
 * Put a folder at the top of the list (once).
 * @param {string} path
 * @returns {FolderRecord}
 */
export function rememberFolderPath(path) {
  const record = { id: folderId(path), path, name: lastPart(path) }
  const rest = folderRecords().filter((r) => r.id !== record.id)
  saveSetting(FOLDERS_KEY, JSON.stringify([record, ...rest].slice(0, 30)))
  return record
}

/** @param {string} id */
export function forgetFolderRecord(id) {
  saveSetting(FOLDERS_KEY, JSON.stringify(folderRecords().filter((r) => r.id !== id)))
}

/** @returns {Promise<TauriFs[]>} */
export async function rememberedTauriFolders() {
  const backend = await appBackend()
  return folderRecords().map((r) => new TauriFs(r.path, r.id, backend))
}

/**
 * Ask for a folder with the system's Open window. Resolves null if cancelled.
 * @returns {Promise<TauriFs | null>}
 */
export async function pickTauriFolder() {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const picked = await open({ directory: true, recursive: true, title: 'Open a game folder' })
  if (typeof picked !== 'string') return null
  const record = rememberFolderPath(picked)
  return new TauriFs(record.path, record.id, await appBackend())
}

/**
 * The project for a .mini file opened from the file manager: its folder.
 * @param {string} filePath full path
 * @returns {Promise<{ fs: TauriFs; file: string }>}
 */
export async function folderForFile(filePath) {
  const record = rememberFolderPath(parentOf(filePath))
  return { fs: new TauriFs(record.path, record.id, await appBackend()), file: lastPart(filePath) }
}

/** @implements {ProjectFs} */
export class TauriFs {
  type = /** @type {const} */ ('disk')
  readOnly = false

  /**
   * @param {string} root full path of the folder
   * @param {string} id
   * @param {FsBackend} backend
   */
  constructor(root, id, backend) {
    this.root = root.replace(/[\\/]+$/, '') || root
    this.id = id
    this.name = lastPart(root)
    this.backend = backend
    // Windows paths keep their own separator so file access rules match them.
    this.sep = this.root.includes('\\') && !this.root.includes('/') ? '\\' : '/'
  }

  /**
   * Full path for a project path.
   * @param {string} path
   */
  full(path) {
    const p = normalize(path)
    if (p === '') return this.root
    return `${this.root}${this.sep}${this.sep === '/' ? p : p.replace(/\//g, '\\')}`
  }

  /** The folder may have moved or been deleted since it was opened. */
  async ensureAccess() {
    try {
      return await this.backend.exists(this.root)
    } catch {
      return false
    }
  }

  /**
   * @param {string} path
   * @returns {Promise<'file' | 'dir' | null>}
   */
  async kindOf(path) {
    try {
      const info = await this.backend.stat(this.full(path))
      return info.isDirectory ? 'dir' : 'file'
    } catch {
      return null
    }
  }

  /** @param {string} path */
  async exists(path) {
    return (await this.kindOf(path)) !== null
  }

  async list() {
    /** @type {Entry[]} */
    const entries = []
    /** @param {string} prefix */
    const walk = async (prefix) => {
      let children
      try {
        children = await this.backend.readDir(this.full(prefix))
      } catch {
        if (prefix === '') throw new FsError(`I can't open the folder "${this.name}". It may have moved.`)
        return
      }
      children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      for (const child of children) {
        if (entries.length >= MAX_ENTRIES) return
        // Links are skipped: they can point outside the project or loop forever.
        if (SKIP.has(child.name) || child.name.startsWith('.') || child.isSymlink) continue
        const path = prefix === '' ? child.name : `${prefix}/${child.name}`
        if (child.isDirectory) {
          entries.push({ path, kind: 'dir' })
          await walk(path)
        } else if (child.isFile) {
          entries.push({ path, kind: 'file' })
        }
      }
    }
    await walk('')
    return sortEntries(entries)
  }

  /** @param {string} path */
  async readBytes(path) {
    const p = normalize(path)
    if ((await this.kindOf(p)) !== 'file') throw new FsError(`I can't find "${p}".`)
    try {
      return await this.backend.readFile(this.full(p))
    } catch {
      throw new FsError(`I couldn't read "${p}".`)
    }
  }

  /** @param {string} path */
  async readBlob(path) {
    const bytes = await this.readBytes(path)
    return new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (bytes)])
  }

  /** @param {string} path */
  async readText(path) {
    return new TextDecoder().decode(await this.readBytes(path))
  }

  /**
   * Check every parent is a folder (or missing), then make them.
   * @param {string} path project path of a file or folder about to be made
   */
  async makeParents(path) {
    const parts = normalize(path).split('/')
    parts.pop()
    let at = ''
    for (const part of parts) {
      at = at === '' ? part : `${at}/${part}`
      const kind = await this.kindOf(at)
      if (kind === 'file') throw new FsError(`"${basename(at)}" is a file, not a folder.`)
      if (kind === null) {
        try {
          await this.backend.mkdir(this.full(at), { recursive: true })
        } catch {
          throw new FsError(`I couldn't make the folder "${at}".`)
        }
      }
    }
  }

  /**
   * @param {string} path
   * @param {Uint8Array} bytes
   */
  async write(path, bytes) {
    const p = normalize(path)
    if (p === '') throw new FsError('A file needs a name.')
    if ((await this.kindOf(p)) === 'dir') throw new FsError(`"${basename(p)}" is a folder.`)
    await this.makeParents(p)
    try {
      await this.backend.writeFile(this.full(p), bytes)
    } catch {
      throw new FsError(`I couldn't save "${p}".`)
    }
  }

  /**
   * @param {string} path
   * @param {string} text
   */
  writeText(path, text) {
    return this.write(path, new TextEncoder().encode(text))
  }

  /**
   * @param {string} path
   * @param {Blob} blob
   */
  async writeBlob(path, blob) {
    return this.write(path, new Uint8Array(await blob.arrayBuffer()))
  }

  /** @param {string} path */
  async mkdir(path) {
    const p = normalize(path)
    if (p === '') return
    const kind = await this.kindOf(p)
    if (kind === 'dir') return
    if (kind === 'file') throw new FsError(`"${basename(p)}" is a file, not a folder.`)
    await this.makeParents(p)
    try {
      await this.backend.mkdir(this.full(p), { recursive: true })
    } catch {
      throw new FsError(`I couldn't make the folder "${p}".`)
    }
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
    if (!(await this.exists(a))) throw new FsError(`I can't find "${a}".`)
    if (await this.exists(b)) throw new FsError(`There is already something called "${basename(b)}" there.`)
    await this.makeParents(b)
    try {
      await this.backend.rename(this.full(a), this.full(b))
    } catch {
      throw new FsError(`I couldn't move "${a}".`)
    }
  }

  /** @param {string} path */
  async remove(path) {
    const p = normalize(path)
    if (p === '') throw new FsError('I won\'t delete the whole project folder.')
    if (!(await this.exists(p))) throw new FsError(`I can't find "${p}".`)
    try {
      await this.backend.remove(this.full(p), { recursive: true })
    } catch {
      throw new FsError(`I couldn't delete "${p}".`)
    }
  }
}
