// Tiny promise wrapper over IndexedDB. One database, three stores:
//   projects  { id, name, created, updated }
//   files     { project, path, kind: 'file' | 'dir', data?: string | Blob }   key [project, path]
//   handles   { id, name, handle }   folders opened from disk, so they can be reopened later

const DB_NAME = 'minijs-studio'
const DB_VERSION = 1

/** @type {Promise<IDBDatabase> | null} */
let opening = null

/** @param {IDBFactory} [factory] */
export function openDb(factory = globalThis.indexedDB) {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    if (!factory) {
      reject(new Error('This browser has no IndexedDB, so projects can\'t be saved here.'))
      return
    }
    const req = factory.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('files')) {
        const files = db.createObjectStore('files', { keyPath: ['project', 'path'] })
        files.createIndex('project', 'project')
      }
      if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  opening.catch(() => {
    opening = null
  })
  return opening
}

/** Forget the cached connection (tests use a fresh fake database per test). */
export function resetDb() {
  opening = null
}

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
export function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Run `fn` in one transaction and resolve when it commits.
 * @template T
 * @param {string | string[]} stores
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function transaction(stores, mode, fn) {
  const db = await openDb()
  const tx = db.transaction(stores, mode)
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Saving was cancelled.'))
  })
  let result
  try {
    result = await fn(tx)
  } catch (error) {
    // Nothing from a failed step should land: undo the whole transaction.
    done.catch(() => {})
    try {
      tx.abort()
    } catch {
      // Already finished.
    }
    throw error
  }
  await done
  return result
}
