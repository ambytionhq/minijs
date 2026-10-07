// Share codes: a whole game squeezed into text, so it fits in a link or can be
// pasted into the Studio with no internet. A pack holds the game file and only
// the pictures it uses.
//
// Link forms: <studio>#/play/<code> (opens straight into the game)
//             <studio>#/open/<code> (offers to save it as a project)

import { collectImageSources } from '@minijs/runtime'
import { compile } from '@minijs/lang'
import { imageCandidates } from '../files/project-assets.js'
import { basename, fileKind } from '../files/paths.js'
import { blobToDataUrl, dataUrlToBlob, fromBase64Url, toBase64Url, transform } from './bytes.js'

/** @import { ProjectFs } from '../files/project.js' */

const VERSION = 1
/** Codes longer than this get a warning: some chat apps cut long links. */
export const LONG_CODE = 8000
/** Codes longer than this are refused; use a zip instead. */
export const MAX_CODE = 400_000

/**
 * @typedef {object} Pack
 * @property {number} v
 * @property {string} name
 * @property {string} main path of the game file
 * @property {Record<string, string>} files path -> text, or a data: URL for pictures
 */

/**
 * Build a pack from a project: the game file plus every picture it names.
 * @param {ProjectFs} fs
 * @param {string} main
 * @param {string} name
 * @returns {Promise<Pack>}
 */
export async function packProject(fs, main, name) {
  const source = await fs.readText(main)
  /** @type {Record<string, string>} */
  const files = { [main]: source }
  const { program } = compile(source)
  if (program) {
    for (const src of collectImageSources(program).keys()) {
      for (const path of imageCandidates(main, src)) {
        if (!(await fs.exists(path))) continue
        files[path] = await blobToDataUrl(await fs.readBlob(path))
        break
      }
    }
  }
  return { v: VERSION, name, main, files }
}

/**
 * @param {Pack} pack
 * @returns {Promise<string>}
 */
export async function encodePack(pack) {
  const json = new TextEncoder().encode(JSON.stringify(pack))
  return `m${VERSION}${toBase64Url(await transform(json, 'deflate-raw', 'compress'))}`
}

/**
 * Find the code inside a pasted link (or a bare code).
 * @param {string} text
 * @returns {string | null}
 */
export function extractCode(text) {
  const t = text.trim()
  const fromLink = /#\/(?:play|open)\/([A-Za-z0-9_-]+)/.exec(t)
  if (fromLink) return fromLink[1]
  if (/^m\d[A-Za-z0-9_-]+$/.test(t)) return t
  // A code inside other words, like "here is my game: m1abc...".
  return /(?:^|[^A-Za-z0-9_-])(m\d[A-Za-z0-9_-]{16,})(?![A-Za-z0-9_-])/.exec(t)?.[1] ?? null
}

/**
 * @param {string} text a link or a code
 * @returns {Promise<Pack | null>} null for anything that isn't a whole, valid pack
 */
export async function decodePack(text) {
  const code = extractCode(text)
  if (!code || !code.startsWith(`m${VERSION}`) || code.length > MAX_CODE) return null
  try {
    const bytes = await transform(fromBase64Url(code.slice(2)), 'deflate-raw', 'decompress')
    const pack = JSON.parse(new TextDecoder().decode(bytes))
    if (!pack || pack.v !== VERSION || typeof pack.main !== 'string' || typeof pack.files !== 'object') return null
    if (typeof pack.files[pack.main] !== 'string') return null
    for (const [path, value] of Object.entries(pack.files)) {
      if (typeof value !== 'string' || path.includes('..') || path.startsWith('/')) return null
    }
    return { v: VERSION, name: typeof pack.name === 'string' ? pack.name : basename(pack.main), main: pack.main, files: pack.files }
  } catch {
    return null
  }
}

/**
 * Files ready to write into a project.
 * @param {Pack} pack
 * @returns {Record<string, string | Blob>}
 */
export function packFiles(pack) {
  /** @type {Record<string, string | Blob>} */
  const out = {}
  for (const [path, value] of Object.entries(pack.files)) {
    out[path] = fileKind(path) === 'image' && value.startsWith('data:') ? dataUrlToBlob(value) : value
  }
  return out
}

/**
 * Full link for a code. `base` is where the Studio lives.
 * @param {string} code
 * @param {'play' | 'open'} mode
 * @param {string} [base]
 */
export function shareLink(code, mode, base = `${location.origin}${location.pathname}`) {
  return `${base}#/${mode}/${code}`
}

