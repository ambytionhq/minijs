// Offline support and updates. On the web, the service worker (built by
// plugins/service-worker.js) keeps the whole app; when a new version has been
// downloaded, the page says so and reloads into it when asked. The desktop app
// checks for signed updates instead (desktop/updates.js) and installs one only
// when asked. Never switches versions behind someone's back, so nothing is
// lost mid-edit.

import { IS_DESKTOP } from './desktop/env.js'

/** @typedef {'unsupported' | 'dev' | 'checking' | 'installing' | 'offline-ready' | 'update-ready' | 'downloading' | 'error'} UpdateState */

/** @type {UpdateState} */
let state = 'unsupported'
/** @type {Set<(s: UpdateState) => void>} */
const listeners = new Set()
/** @type {ServiceWorkerRegistration | null} */
let registration = null
let reloadRequested = false
let started = false
/** @type {Promise<'found' | 'newest' | 'failed'> | null} */
let checking = null

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
export function checkForUpdates() {
  if (!IS_DESKTOP) return Promise.resolve('newest')
  if (state === 'downloading') return Promise.resolve('found')
  if (checking) return checking
  const previous = state
  if (!updateVersion) set('checking')
  checking = (async () => {
    try {
      const { findUpdate } = await import('./desktop/updates.js')
      const found = await findUpdate()
      updateVersion = found?.version ?? ''
      if (state !== 'downloading') set(found ? 'update-ready' : 'offline-ready')
      return found ? 'found' : 'newest'
    } catch {
      if (state !== 'downloading') set(updateVersion ? 'update-ready' : previous === 'dev' ? 'dev' : 'error')
      return 'failed'
    }
  })().finally(() => { checking = null })
  return checking
}

export async function startOffline() {
  if (started) return
  started = true
  if (IS_DESKTOP) {
    if (import.meta.env.DEV) {
      set('dev')
      return
    }
    // Give the app a moment to settle, then check now and again.
    window.setTimeout(() => void checkForUpdates(), 8000)
    window.setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000)
    let lastCheck = Date.now()
    const checkOnReturn = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 5 * 60 * 1000) return
      lastCheck = Date.now()
      void checkForUpdates()
    }
    document.addEventListener('visibilitychange', checkOnReturn)
    window.addEventListener('online', () => void checkForUpdates())
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
      // The first offline installation also claims the page. Keep that first
      // session intact; only reload after the person has saved and accepted.
      if (!reloadRequested || reloading) return
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
    if (!registration) throw new Error('Offline updates are not available yet.')
    reloadRequested = true
    if (registration.waiting) registration.waiting.postMessage('skip-waiting')
    else location.reload()
    return
  }
  if (state === 'downloading') return
  if (checking) await checking
  if (!updateVersion) throw new Error('Check for updates before installing.')
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
