// compile(source): lex -> parse -> check. See docs/spec.md section 2.

import { check } from './checker.js'
import { lex } from './lexer.js'
import { parse } from './parser.js'

/** @import { Program } from './ast.js' */
/** @import { MiniError } from './errors.js' */

/** Most errors reported for one file. */
export const MAX_ERRORS = 50

/**
 * @typedef {object} CompileResult
 * @property {Program | null} program null whenever there are errors.
 * @property {MiniError[]} errors sorted by line, then column.
 */

/**
 * @param {string} source
 * @returns {CompileResult}
 */
export function compile(source) {
  const lexed = lex(source)
  const parsed = parse(lexed.tokens)
  // A line the lexer already complained about would only add a confusing follow-up error.
  const lexLines = new Set(lexed.errors.map((e) => e.line))
  let errors = [...lexed.errors, ...parsed.errors.filter((e) => !lexLines.has(e.line))]
  // Name checks only make sense once the file reads cleanly.
  if (errors.length === 0) errors = check(parsed.program)
  errors.sort((a, b) => a.line - b.line || a.col - b.col)
  if (errors.length > MAX_ERRORS) errors = errors.slice(0, MAX_ERRORS)
  return { program: errors.length > 0 ? null : parsed.program, errors }
}
