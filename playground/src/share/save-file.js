// Hand a file to the person: a download in the browser, a "Save as" window in
// the desktop app (wired up by desktop/bridge.js when it is present).

/** @type {((blob: Blob, name: string) => Promise<boolean>) | null} */
let nativeSave = null

/** @param {(blob: Blob, name: string) => Promise<boolean>} fn */
export function setNativeSave(fn) {
  nativeSave = fn
}

/**
 * @param {Blob} blob
 * @param {string} name
 * @returns {Promise<boolean>} false when the person cancelled
 */
export async function saveFile(blob, name) {
  if (nativeSave) return nativeSave(blob, name)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return true
}
