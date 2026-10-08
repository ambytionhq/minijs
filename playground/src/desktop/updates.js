// Self-updates for the desktop app. New versions are signed; the app checks
// a little after starting and every few hours, then waits for the person to
// say "Install" (their work is saved first). Nothing installs on its own.

import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

/** @import { Update } from '@tauri-apps/plugin-updater' */

/** @type {Update | null} */
let pending = null
/** @type {Promise<{ version: string; notes: string } | null> | null} */
let checking = null
/** @type {Promise<void> | null} */
let installing = null

/**
 * Look for a newer version.
 * @returns {Promise<{ version: string; notes: string } | null>} null when this is the newest
 */
export function findUpdate() {
  if (installing) return Promise.resolve(pending ? { version: pending.version, notes: pending.body ?? '' } : null)
  if (checking) return checking
  checking = (async () => {
    const update = await check({ timeout: 30000 })
    const previous = pending
    pending = update
    if (previous && previous !== update) await previous.close().catch(() => {})
    return update ? { version: update.version, notes: update.body ?? '' } : null
  })().finally(() => { checking = null })
  return checking
}

/**
 * Download and install the update found by `findUpdate`, then restart.
 * @param {(done: number | null) => void} onProgress 0 to 1, or null when the size is unknown
 */
export function installUpdate(onProgress) {
  if (installing) return installing
  installing = (async () => {
    if (checking) await checking
    const update = pending
    if (!update) throw new Error('There is no update to install.')
    let total = 0
    let got = 0
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0
        got = 0
        onProgress(total ? 0 : null)
      } else if (event.event === 'Progress') {
        got += event.data.chunkLength
        onProgress(total ? Math.min(1, got / total) : null)
      } else if (event.event === 'Finished') {
        onProgress(1)
      }
    }, { timeout: 120000 })
    await relaunch()
  })().finally(() => { installing = null })
  return installing
}
