// localStorage helpers that never throw. Private windows, blocked storage, and
// sandboxed frames all make localStorage throw; the page must still work.

const PREFIX = 'minijs:source:'

/** @returns {Storage | null} */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * Saved text for an example, or null.
 * @param {string} key
 * @param {Storage | null} [storage]
 * @returns {string | null}
 */
export function loadSource(key, storage = defaultStorage()) {
  try {
    return storage ? storage.getItem(PREFIX + key) : null
  } catch {
    return null
  }
}

/**
 * @param {string} key
 * @param {string} text
 * @param {Storage | null} [storage]
 */
export function saveSource(key, text, storage = defaultStorage()) {
  try {
    storage?.setItem(PREFIX + key, text)
  } catch {
    // Full or blocked: keep working without saving.
  }
}

/**
 * @param {string} key
 * @param {Storage | null} [storage]
 */
export function clearSource(key, storage = defaultStorage()) {
  try {
    storage?.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

/**
 * Remember a small setting, like the last opened example.
 * @param {string} name
 * @param {Storage | null} [storage]
 * @returns {string | null}
 */
export function loadSetting(name, storage = defaultStorage()) {
  try {
    return storage ? storage.getItem(`minijs:${name}`) : null
  } catch {
    return null
  }
}

/**
 * @param {string} name
 * @param {string} value
 * @param {Storage | null} [storage]
 */
export function saveSetting(name, value, storage = defaultStorage()) {
  try {
    storage?.setItem(`minijs:${name}`, value)
  } catch {
    // ignore
  }
}
