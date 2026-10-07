import { Cursor } from '../src/cursor.js'
import { lex } from '../src/lexer.js'

/**
 * Deep copy without any `loc` keys, for comparing ASTs by shape.
 * @param {unknown} value
 * @returns {any}
 */
export function strip(value) {
  if (Array.isArray(value)) return value.map(strip)
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const [k, v] of Object.entries(value)) if (k !== 'loc') out[k] = strip(v)
    return out
  }
  return value
}

/** @param {string} src */
export const cursor = (src) => new Cursor(lex(src).tokens)

/**
 * Run fn and return the MiniError carried by the ParseError it throws.
 * @param {() => unknown} fn
 */
export function parseErrorOf(fn) {
  try {
    fn()
  } catch (e) {
    if (e && typeof e === 'object' && 'error' in e) return e.error
    throw e
  }
  throw new Error('expected a ParseError')
}
