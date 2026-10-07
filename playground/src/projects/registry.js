// Every project the Studio knows: built-in examples, projects in this browser,
// and folders on this computer. Ids look like "example:cloud-hopper",
// "browser:p1abc" and "disk:k2xyz".

import { canOpenFolders, rememberedFolders } from '../files/folders.js'
import { IdbFs, createBrowserProject, listBrowserProjects } from '../files/idb-fs.js'
import { fileKind } from '../files/paths.js'
import { loadSetting, saveSetting } from '../storage.js'
import { EXAMPLES } from './examples.js'

/** @import { ProjectFs } from '../files/project.js' */
/** @import { ProjectRecord } from '../files/idb-fs.js' */
/** @import { FolderFs } from '../files/folders.js' */

/**
 * @typedef {object} ProjectList
 * @property {ProjectRecord[]} browser newest first
 * @property {FolderFs[]} folders
 * @property {boolean} storageWorks false when this browser can't keep projects (private mode)
 */

/** @returns {Promise<ProjectList>} */
export async function listProjects() {
  /** @type {ProjectList} */
  const out = { browser: [], folders: [], storageWorks: true }
  try {
    out.browser = await listBrowserProjects()
  } catch {
    out.storageWorks = false
  }
  if (canOpenFolders()) {
    try {
      out.folders = await rememberedFolders()
    } catch {
      out.folders = []
    }
  }
  return out
}

/**
 * Find a project by id. Folders still need `ensureAccess()` from a click.
 * @param {string} id
 * @returns {Promise<ProjectFs | null>}
 */
export async function projectById(id) {
  const example = EXAMPLES.get(id)
  if (example) return example.fs
  if (id.startsWith('browser:')) {
    const projectId = id.slice('browser:'.length)
    const record = (await listBrowserProjects().catch(() => [])).find((p) => p.id === projectId)
    return record ? new IdbFs(record.id, record.name) : null
  }
  if (id.startsWith('disk:')) {
    return (await rememberedFolders().catch(() => [])).find((d) => d.id === id) ?? null
  }
  return null
}

/**
 * The game file to open first: the last one opened, else the example's main file, else the first game.
 * @param {ProjectFs} fs
 * @returns {Promise<string | null>}
 */
export async function firstFile(fs) {
  const entries = await fs.list()
  const files = new Set(entries.filter((e) => e.kind === 'file').map((e) => e.path))
  const remembered = loadSetting(`open:${fs.id}`)
  if (remembered && files.has(remembered)) return remembered
  const example = EXAMPLES.get(fs.id)
  if (example && files.has(example.info.main)) return example.info.main
  if (files.has('game.mini')) return 'game.mini'
  return entries.find((e) => e.kind === 'file' && fileKind(e.path) === 'mini')?.path ?? null
}

/** @param {ProjectFs} fs @param {string} path */
export function rememberOpenFile(fs, path) {
  saveSetting(`open:${fs.id}`, path)
}

/**
 * Make a new project in this browser.
 * @param {string} name
 * @param {Record<string, string | Blob>} files
 */
export function createProject(name, files) {
  return createBrowserProject(name, files)
}

/**
 * The tutorial's own project, made on first use.
 * @param {string} starter
 * @returns {Promise<ProjectFs>}
 */
export async function tutorialProject(starter) {
  const id = loadSetting('tutorial-project')
  if (id) {
    const existing = await projectById(id)
    if (existing) return existing
  }
  const project = await createBrowserProject('Tutorial', { 'game.mini': starter })
  saveSetting('tutorial-project', project.id)
  return project
}

/**
 * Relative time like "just now", "5 minutes ago", "2 days ago".
 * @param {number} then ms
 * @param {number} [now]
 */
export function timeAgo(then, now = Date.now()) {
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 45) return 'just now'
  const units = /** @type {Array<[number, string]>} */ ([
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
    [2629800, 'month'],
    [31557600, 'year'],
  ])
  let pick = units[0]
  for (const u of units) if (s >= u[0] * 0.9) pick = u
  const n = Math.max(1, Math.round(s / pick[0]))
  return `${n} ${pick[1]}${n === 1 ? '' : 's'} ago`
}
