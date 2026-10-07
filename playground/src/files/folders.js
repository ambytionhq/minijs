// Folders on this computer, whichever way this Studio can reach them: the
// desktop app's own file access, or the browser's folder access (Chromium).
// The desktop code is only loaded inside the desktop app.

import { IS_DESKTOP } from '../desktop/env.js'
import * as browser from './disk-fs.js'

/** @import { ProjectFs } from './project.js' */

/**
 * @typedef {ProjectFs & { ensureAccess(): Promise<boolean> }} FolderFs
 */

const desktop = () => import('./tauri-fs.js')

/** True when this Studio can open folders from disk. */
export function canOpenFolders() {
  return IS_DESKTOP || browser.canOpenFolders()
}

/**
 * Ask the person to pick a folder. Resolves null if they cancel.
 * @returns {Promise<FolderFs | null>}
 */
export async function pickFolder() {
  return IS_DESKTOP ? (await desktop()).pickTauriFolder() : browser.pickFolder()
}

/** @returns {Promise<FolderFs[]>} folders opened before */
export async function rememberedFolders() {
  return IS_DESKTOP ? (await desktop()).rememberedTauriFolders() : browser.rememberedFolders()
}

/** @param {string} id */
export async function forgetFolder(id) {
  if (IS_DESKTOP) (await desktop()).forgetFolderRecord(id)
  else await browser.forgetFolder(id)
}
