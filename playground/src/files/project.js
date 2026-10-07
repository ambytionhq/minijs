// The shape every project storage shares: built-in examples, projects kept in
// this browser, and real folders on disk. Paths come from paths.js.

/**
 * @typedef {object} Entry
 * @property {string} path
 * @property {'file' | 'dir'} kind
 */

/**
 * @typedef {object} ProjectFs
 * @property {string} id Stable id for remembering the open project.
 * @property {string} name Shown in the project picker.
 * @property {'examples' | 'browser' | 'disk' | 'memory'} type
 * @property {boolean} readOnly No new, rename, delete or upload. Text edits may still be kept elsewhere.
 * @property {() => Promise<Entry[]>} list Every file and folder, parents before children, sorted.
 * @property {(path: string) => Promise<string>} readText
 * @property {(path: string) => Promise<Blob>} readBlob
 * @property {(path: string, text: string) => Promise<void>} writeText Creates parent folders.
 * @property {(path: string, blob: Blob) => Promise<void>} writeBlob Creates parent folders.
 * @property {(path: string) => Promise<void>} mkdir Creates parents too. Fine if it exists.
 * @property {(from: string, to: string) => Promise<void>} rename Files or whole folders.
 * @property {(path: string) => Promise<void>} remove Files or whole folders.
 * @property {(path: string) => Promise<boolean>} exists
 */

/** Thrown for missing paths, name clashes and read-only projects. Message is shown to people. */
export class FsError extends Error {}

/**
 * Sort entries: parents before children, folders before files at each level, then by name.
 * @param {Entry[]} entries
 * @returns {Entry[]}
 */
export function sortEntries(entries) {
  /** @param {Entry} e */
  const key = (e) =>
    e.path
      .split('/')
      .map((part, i, all) => `${i === all.length - 1 && e.kind === 'file' ? '1' : '0'}${part.toLowerCase()}`)
      .join('\u0000')
  return [...entries].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

/**
 * A name like "untitled.mini" that doesn't exist yet in `dir`: "untitled 2.mini", ...
 * @param {ProjectFs} fs
 * @param {string} dir
 * @param {string} base e.g. "untitled"
 * @param {string} ext e.g. ".mini", or "" for folders
 */
export async function freeName(fs, dir, base, ext) {
  const prefix = dir === '' ? '' : `${dir}/`
  for (let i = 1; ; i++) {
    const path = `${prefix}${base}${i === 1 ? '' : ` ${i}`}${ext}`
    if (!(await fs.exists(path))) return path
  }
}
