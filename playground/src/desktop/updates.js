// Self-updates for the desktop app. New versions are signed; the app checks
// a little after starting and every few hours, then waits for the person to
// say "Install" (their work is saved first). Nothing installs on its own.

import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

/** @import { Update } from '@tauri-apps/plugin-updater' */

/** @type {Update | null} */
let pending = null

/**
 * Look for a newer version.
 * @returns {Promise<{ version: string; notes: string } | null>} null when this is the newest
 */
export async function findUpdate() {
  const update = await check()
  if (!update) return null
  pending = update
  return { version: update.version, notes: update.body ?? '' }
}

/**
 * Download and install the update found by `findUpdate`, then restart.
 * @param {(done: number | null) => void} onProgress 0 to 1, or null when the size is unknown
 */
export async function installUpdate(onProgress) {
  if (!pending) throw new Error('There is no update to install.')
  let total = 0
  let got = 0
  await pending.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0
      onProgress(total ? 0 : null)
    } else if (event.event === 'Progress') {
      got += event.data.chunkLength
      onProgress(total ? Math.min(1, got / total) : null)
    } else if (event.event === 'Finished') {
      onProgress(1)
    }
  })
  await relaunch()
}
