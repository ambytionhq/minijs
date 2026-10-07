// Indentation-aware lexer. See docs/spec.md section 4.1.
// Blank and comment-only lines produce no tokens, so they never affect indentation.

import { miniError } from './errors.js'

/** @import { Loc } from './ast.js' */
/** @import { MiniError } from './errors.js' */

/** @typedef {'word' | 'number' | 'string' | 'color' | 'comma' | 'op' | 'newline' | 'indent' | 'dedent' | 'eof'} TokenKind */

/**
 * @typedef {object} Token
 * @property {TokenKind} kind
 * @property {string} text word: lowercase text. string: unescaped contents. color: lowercase '#abc'. op: '+', '-', '*', '/'.
 * @property {number} value number value; 0 for other kinds.
 * @property {Loc} loc
 */

/**
 * @typedef {object} LexResult
 * @property {Token[]} tokens
 * @property {MiniError[]} errors
 */

const HEX_COLOR = /^#(?:[0-9a-f]{6}|[0-9a-f]{3})(?=\s|$)/i
const NUMBER = /^\d+(?:\.\d+)?/
const GLUED = /^[A-Za-z0-9_.]*/
const WORD = /^[A-Za-z][A-Za-z0-9_-]*/

/**
 * @param {TokenKind} kind
 * @param {string} text
 * @param {number} value
 * @param {number} line
 * @param {number} col
 * @returns {Token}
 */
function token(kind, text, value, line, col) {
  return { kind, text, value, loc: { line, col } }
}

/**
 * True when the line holds nothing but whitespace and maybe a comment.
 * @param {string} rest line content after leading whitespace
 */
function isEmptyLine(rest) {
  return rest === '' || (rest[0] === '#' && !HEX_COLOR.test(rest))
}

/**
 * @param {string} source
 * @returns {LexResult}
 */
export function lex(source) {
  /** @type {Token[]} */
  const tokens = []
  /** @type {MiniError[]} */
  const errors = []
  const lines = source.split(/\r?\n/)

  /** @type {string | null} */
  let unitChar = null
  let unitWidth = 0
  let depth = 0
  let end = { line: 1, col: 1 }

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]
    const line = i + 1
    const indentWidth = text.length - text.replace(/^[ \t]+/, '').length
    const lead = text.slice(0, indentWidth)
    if (isEmptyLine(text.slice(indentWidth).trimEnd())) continue

    // Indentation.
    let level = 0
    if (indentWidth > 0) {
      const char = lead[0]
      if (lead.includes(' ') && lead.includes('\t')) {
        errors.push(indentMixed(line))
        continue
      }
      if (unitChar === null) {
        unitChar = char
        unitWidth = indentWidth
      } else if (char !== unitChar) {
        errors.push(indentMixed(line))
        continue
      }
      if (indentWidth % unitWidth !== 0) {
        const unit = unitChar === '\t' ? (unitWidth === 1 ? '1 tab' : `${unitWidth} tabs`) : `${unitWidth} spaces`
        errors.push(
          miniError(
            'indent-uneven',
            { line, col: 1 },
            'This line is indented by an odd amount.',
            `Indent each level by ${unit}, like the lines above.`,
          ),
        )
        continue
      }
      level = indentWidth / unitWidth
      if (level > depth + 1) {
        errors.push(
          miniError(
            'indent-unexpected',
            { line, col: 1 },
            'This line is indented more than I expected.',
            'Only indent lines that belong to the line above, like the actions under a "when".',
          ),
        )
        continue
      }
    }
    if (level === depth + 1) {
      tokens.push(token('indent', '', 0, line, indentWidth + 1))
      depth = level
    }
    while (depth > level) {
      tokens.push(token('dedent', '', 0, line, indentWidth + 1))
      depth--
    }

    // Line contents.
    let pos = indentWidth
    let lastEnd = indentWidth
    while (pos < text.length) {
      const ch = text[pos]
      const col = pos + 1
      const rest = text.slice(pos)
      if (ch === ' ' || ch === '\t') {
        pos++
        continue
      }
      if (ch === '#') {
        const m = HEX_COLOR.exec(rest)
        if (!m) break
        tokens.push(token('color', m[0].toLowerCase(), 0, line, col))
        pos += m[0].length
      } else if (ch === '"') {
        let value = ''
        let j = pos + 1
        let closed = false
        while (j < text.length) {
          const c = text[j]
          if (c === '\\' && (text[j + 1] === '"' || text[j + 1] === '\\')) {
            value += text[j + 1]
            j += 2
          } else if (c === '"') {
            closed = true
            j++
            break
          } else {
            value += c
            j++
          }
        }
        if (!closed) {
          errors.push(
            miniError(
              'unterminated-string',
              { line, col },
              'This text is missing its closing quote (").',
              'Add a " at the end of the text.',
            ),
          )
        }
        tokens.push(token('string', value, 0, line, col))
        pos = j
      } else if (ch >= '0' && ch <= '9') {
        const m = /** @type {RegExpExecArray} */ (NUMBER.exec(rest))
        const next = text[pos + m[0].length]
        if (next !== undefined && /[A-Za-z_]/.test(next)) {
          const glued = /** @type {RegExpExecArray} */ (GLUED.exec(rest))[0]
          errors.push(
            miniError(
              'bad-number',
              { line, col },
              `I expected a number but found "${glued}".`,
              'Write just the number, like 10.',
            ),
          )
          pos += glued.length
        } else {
          tokens.push(token('number', m[0], Number(m[0]), line, col))
          pos += m[0].length
        }
      } else if (/[A-Za-z]/.test(ch)) {
        const m = /** @type {RegExpExecArray} */ (WORD.exec(rest))
        tokens.push(token('word', m[0].toLowerCase(), 0, line, col))
        pos += m[0].length
      } else if (ch === ',') {
        tokens.push(token('comma', ',', 0, line, col))
        pos++
      } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
        tokens.push(token('op', ch, 0, line, col))
        pos++
      } else {
        errors.push(miniError('unknown-word', { line, col }, `I don't understand the symbol "${ch}".`))
        pos++
      }
      lastEnd = pos
    }
    end = { line, col: lastEnd + 1 }
    tokens.push(token('newline', '', 0, end.line, end.col))
  }

  while (depth > 0) {
    tokens.push(token('dedent', '', 0, end.line, end.col))
    depth--
  }
  tokens.push(token('eof', '', 0, end.line, end.col))
  return { tokens, errors }
}

/** @param {number} line */
function indentMixed(line) {
  return miniError(
    'indent-mixed',
    { line, col: 1 },
    'This line mixes tabs and spaces at the start.',
    'Use only spaces or only tabs to indent.',
  )
}
