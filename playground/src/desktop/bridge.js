// Everything the desktop app adds to the Studio: native save windows, the menu
// bar, .mini files opened from the file manager, links that open in the
// person's browser, full screen keys, and showing the window once it has drawn.
// Only loaded inside the desktop app.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { openUrl } from '@tauri-apps/plugin-opener'
import { setNativeSave } from '../share/save-file.js'

/**
 * @typedef {object} Startup
 * @property {string | null} game share code of the game, when this is an exported game
 * @property {string | null} title that game's name
 * @property {'macos' | 'windows' | 'linux'} os
 */

/**
 * @typedef {object} DesktopActions
 * @property {(id: string) => void} menu a menu item was picked
 * @property {(paths: string[]) => void} openFiles .mini files to open
 */

/** @type {Startup} */
let info = { game: null, title: null, os: 'macos' }

/** @returns {Startup} */
export function startupInfo() {
  return info
}

/** Show the window (it starts hidden so there's no white flash). */
export async function showWindow() {
  const win = getCurrentWindow()
  await win.show().catch(() => {})
  await win.setFocus().catch(() => {})
}

/** File type names for the Save window. */
const FILTERS = /** @type {Record<string, string>} */ ({
  html: 'Web page',
  zip: 'Zip archive',
  png: 'PNG picture',
  mini: 'minijs game',
})

/**
 * Save with the system's Save window.
 * @param {Blob} blob
 * @param {string} name
 */
async function nativeSave(blob, name) {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  const path = await save({
    defaultPath: name,
    filters: ext ? [{ name: FILTERS[ext] ?? ext.toUpperCase(), extensions: [ext] }] : [],
  })
  if (typeof path !== 'string') return false
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
  return true
}

/**
 * Open web links in the person's browser instead of inside the app.
 * @param {MouseEvent} event
 */
function externalLinks(event) {
  const target = /** @type {Element | null} */ (event.target)
  const a = /** @type {HTMLAnchorElement | null} */ (target?.closest?.('a[href]') ?? null)
  if (!a) return
  let url
  try {
    url = new URL(a.href)
  } catch {
    return
  }
  if ((url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') && url.origin !== location.origin) {
    event.preventDefault()
    void openUrl(url.href)
  }
}

/**
 * F11 everywhere, and Ctrl+Cmd+F on macOS (the menu also has it there).
 * @param {KeyboardEvent} event
 */
async function fullScreenKeys(event) {
  const mac = info.os === 'macos'
  const wanted = event.key === 'F11' || (mac && event.metaKey && event.ctrlKey && event.key.toLowerCase() === 'f')
  if (!wanted) return
  event.preventDefault()
  const win = getCurrentWindow()
  await win.setFullscreen(!(await win.isFullscreen()))
}

/**
 * Wire the app up. Call once, before the first page is shown.
 * @param {DesktopActions} actions
 * @returns {Promise<Startup>}
 */
export async function startDesktop(actions) {
  info = await invoke('startup')
  document.documentElement.dataset.desktop = info.os
  setNativeSave(nativeSave)
  document.addEventListener('click', externalLinks)
  window.addEventListener('keydown', (e) => void fullScreenKeys(e))
  if (info.game) return info

  await listen('menu', (event) => actions.menu(String(event.payload)))
  const takeFiles = async () => {
    const paths = /** @type {string[]} */ (await invoke('take_opened_files'))
    if (paths.length > 0) actions.openFiles(paths)
  }
  await listen('open-files', () => void takeFiles())
  // Files opened before the page was ready wait in the app until now.
  setTimeout(() => void takeFiles(), 0)
  return info
}

/**
 * Turn a game into an app with the system's folder window.
 * @param {{ title: string; code: string }} game
 * @returns {Promise<string | null>} the new app or folder, or null if cancelled
 */
export async function exportApp({ title, code }) {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const parent = await open({ directory: true, title: 'Where should the app go?' })
  if (typeof parent !== 'string') return null
  return /** @type {Promise<string>} */ (invoke('export_app', { parent, title, code }))
}

/** @param {string} path */
export async function reveal(path) {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(path)
}

/** @param {string} title */
export async function setWindowTitle(title) {
  await getCurrentWindow().setTitle(title).catch(() => {})
}
