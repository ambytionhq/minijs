// Offline support and updates for the web Studio. The service worker (built by
// plugins/service-worker.js) keeps the whole app; when a new version has been
// downloaded, the page says so and reloads into it when asked. Never switches
// versions behind someone's back, so nothing is lost mid-edit.

/** @typedef {'unsupported' | 'dev' | 'installing' | 'offline-ready' | 'update-ready' | 'error'} UpdateState */

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

/** Running inside the desktop app, which updates itself instead. */
export const IS_DESKTOP = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function startOffline() {
  if (IS_DESKTOP || !('serviceWorker' in navigator)) return
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

/** Switch to the downloaded version (the page reloads). Call after saving work. */
export function applyUpdate() {
  registration?.waiting?.postMessage('skip-waiting')
}
