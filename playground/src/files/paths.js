// Project paths: forward slashes, no leading slash, no "." or ".." parts.
// "" is the project root.

/**
 * @param {string} path
 * @returns {string}
 */
export function normalize(path) {
  /** @type {string[]} */
  const out = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/** @param {...string} parts */
export function join(...parts) {
  return normalize(parts.filter((p) => p !== '').join('/'))
}

/** @param {string} path */
export function dirname(path) {
  const p = normalize(path)
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

/** @param {string} path */
export function basename(path) {
  const p = normalize(path)
  return p.slice(p.lastIndexOf('/') + 1)
}

/** Lowercase extension without the dot, or "". @param {string} path */
export function extname(path) {
  const name = basename(path)
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i + 1).toLowerCase()
}

/** True when `path` is `dir` or inside it. @param {string} path @param {string} dir */
export function isInside(path, dir) {
  return dir === '' || path === dir || path.startsWith(`${dir}/`)
}

const IMAGE_TYPES = /** @type {Record<string, string>} */ ({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
})

const TEXT_EXTENSIONS = new Set(['mini', 'txt', 'md', 'json', 'csv', 'js', 'css', 'html', 'xml', 'yml', 'yaml', 'toml', 'ini', 'log'])

/** @typedef {'mini' | 'image' | 'text' | 'other'} FileKind */

/**
 * What the Studio can do with a file, from its name.
 * @param {string} path
 * @returns {FileKind}
 */
export function fileKind(path) {
  const ext = extname(path)
  if (ext === 'mini') return 'mini'
  if (ext in IMAGE_TYPES) return 'image'
  if (TEXT_EXTENSIONS.has(ext) || ext === '') return 'text'
  return 'other'
}

/** @param {string} path */
export function mimeType(path) {
  const ext = extname(path)
  if (ext in IMAGE_TYPES) return IMAGE_TYPES[ext]
  if (ext === 'json') return 'application/json'
  return fileKind(path) === 'other' ? 'application/octet-stream' : 'text/plain'
}

const BAD_NAME = /[\\/:*?"<>|\u0000-\u001f]/

/**
 * Why a file or folder name can't be used, or null when it is fine.
 * @param {string} name
 * @returns {string | null}
 */
export function nameProblem(name) {
  if (name.trim() === '') return 'Names can\'t be empty.'
  if (name === '.' || name === '..') return 'That name is reserved.'
  if (BAD_NAME.test(name)) return 'Names can\'t contain / \\ : * ? " < > or |.'
  if (name !== name.trim()) return 'Names can\'t start or end with a space.'
  if (name.length > 120) return 'That name is too long.'
  return null
}
