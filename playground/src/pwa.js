// Offline support and updates. On the web, the service worker (built by
// plugins/service-worker.js) keeps the whole app; when a new version has been
// downloaded, the page says so and reloads into it when asked. The desktop app
// checks for signed updates instead (desktop/updates.js) and installs one only
// when asked. Never switches versions behind someone's back, so nothing is
// lost mid-edit.

import { IS_DESKTOP } from './desktop/env.js'

/** @typedef {'unsupported' | 'dev' | 'installing' | 'offline-ready' | 'update-ready' | 'downloading' | 'error'} UpdateState */

/** @type {UpdateState} */
let state = 'unsupported'
/** @type {Set<(s: UpdateState) => void>} */
const listeners = new Set()
/** @type {ServiceWorkerRegistration | null} */
let registration = null

/** @param {UpdateState} next */
function set(next) {
  state = next
  for (const fn of listeners) fn(state)
}

/** @param {(s: UpdateState) => void} fn @returns {() => void} */
export function onUpdateState(fn) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'

/** The version waiting to install in the desktop app, if any. */
export let updateVersion = ''

/** @type {Set<(done: number | null) => void>} */
const progressListeners = new Set()

/** @param {(done: number | null) => void} fn 0 to 1 while a desktop update downloads @returns {() => void} */
export function onUpdateProgress(fn) {
  progressListeners.add(fn)
  return () => progressListeners.delete(fn)
}

/**
 * Desktop: look for a new version now.
 * @returns {Promise<'found' | 'newest' | 'failed'>}
 */
export async function checkForUpdates() {
  if (!IS_DESKTOP) return 'newest'
  try {
    const { findUpdate } = await import('./desktop/updates.js')
    const found = await findUpdate()
    if (!found) return 'newest'
    updateVersion = found.version
    if (state !== 'downloading') set('update-ready')
    return 'found'
  } catch {
    return 'failed'
  }
}

export async function startOffline() {
  if (IS_DESKTOP) {
    if (import.meta.env.DEV) {
      set('dev')
      return
    }
    // Give the app a moment to settle, then check now and again.
    window.setTimeout(() => void checkForUpdates(), 8000)
    window.setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000)
    return
  }
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) {
    set('dev')
    return
  }
  try {
    registration = await navigator.serviceWorker.register('./sw.js')
    if (registration.waiting) set('update-ready')
    else set(navigator.serviceWorker.controller ? 'offline-ready' : 'installing')
    registration.addEventListener('updatefound', () => {
      const worker = registration?.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state !== 'installed') return
        // A worker already in charge means this one is a newer version.
        set(navigator.serviceWorker.controller ? 'update-ready' : 'offline-ready')
      })
    })
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      location.reload()
    })
    // Look for new versions now and then, and whenever the Studio comes back into view.
    const check = () => void registration?.update().catch(() => {})
    window.setInterval(check, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  } catch {
    set('error')
  }
}

/** Switch to the downloaded version (the page reloads, or the app restarts). Call after saving work. */
export async function applyUpdate() {
  if (!IS_DESKTOP) {
    registration?.waiting?.postMessage('skip-waiting')
    return
  }
  const { installUpdate } = await import('./desktop/updates.js')
  set('downloading')
  try {
    await installUpdate((done) => {
      for (const fn of progressListeners) fn(done)
    })
  } catch (error) {
    set('update-ready')
    throw error
  }
}
