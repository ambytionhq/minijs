// Token cursor shared by the parser modules. Parse helpers throw ParseError;
// the top-level parser catches it per line and recovers.

import { miniError } from './errors.js'

/** @import { MiniError, MiniErrorCode } from './errors.js' */
/** @import { Loc } from './ast.js' */
/** @import { Token } from './lexer.js' */

export class ParseError extends Error {
  /** @param {MiniError} error */
  constructor(error) {
    super(error.message)
    this.error = error
  }
}

/**
 * @param {MiniErrorCode} code
 * @param {Loc} loc
 * @param {string} message
 * @param {string | null} [hint=null]
 * @returns {ParseError}
 */
export function fail(code, loc, message, hint = null) {
  return new ParseError(miniError(code, loc, message, hint))
}

/**
 * Words that can never be names of things, numbers or animations.
 * `a` and `an` are fillers too (`make a coin`) but stay usable as names, so `a is 1` works.
 * @type {ReadonlySet<string>}
 */
export const RESERVED = new Set(
  (
    'game thing control when always key mouse gamepad any random count the not and or is to at by of on in ' +
    'left right up down x y vx vy width height text pressed held released'
  ).split(' '),
)

/**
 * How a token reads inside an error message.
 * @param {Token} t
 * @returns {string}
 */
export function describeToken(t) {
  switch (t.kind) {
    case 'word':
      return `"${t.text}"`
    case 'number':
      return `the number ${t.value}`
    case 'string':
      return 'some text'
    case 'color':
      return `the color ${t.text}`
    case 'comma':
      return 'a comma'
    case 'op':
      return `"${t.text}"`
    case 'newline':
    case 'dedent':
      return 'the end of the line'
    case 'indent':
      return 'an indented line'
    case 'eof':
      return 'the end of the file'
  }
}

/**
 * `expected` error: I expected {what} here, but found {token}.
 * @param {Token} t
 * @param {string} what
 * @param {string | null} [hint=null]
 * @returns {ParseError}
 */
export function expected(t, what, hint = null) {
  return fail('expected', t.loc, `I expected ${what} here, but found ${describeToken(t)}.`, hint)
}

export class Cursor {
  /** @param {Token[]} tokens must end with an `eof` token */
  constructor(tokens) {
    this.tokens = tokens
    this.pos = 0
  }

  /**
   * @param {number} [offset=0]
   * @returns {Token}
   */
  peek(offset = 0) {
    const i = Math.min(this.pos + offset, this.tokens.length - 1)
    return this.tokens[i]
  }

  /** @returns {Token} */
  next() {
    const t = this.peek()
    if (this.pos < this.tokens.length - 1) this.pos++
    return t
  }

  /**
   * @param {string} word
   * @param {number} [offset=0]
   */
  isWord(word, offset = 0) {
    const t = this.peek(offset)
    return t.kind === 'word' && t.text === word
  }

  /** Consume the word if it is next. @param {string} word */
  acceptWord(word) {
    if (!this.isWord(word)) return false
    this.next()
    return true
  }

  /** Consume the whole sequence only if all of it matches. @param {...string} words */
  acceptWords(...words) {
    for (let i = 0; i < words.length; i++) if (!this.isWord(words[i], i)) return false
    this.pos += words.length
    return true
  }

  /**
   * @param {string} word
   * @param {string | null} [hint=null]
   * @returns {Token}
   */
  expectWord(word, hint = null) {
    if (!this.isWord(word)) throw expected(this.peek(), `"${word}"`, hint)
    return this.next()
  }

  /**
   * A word that is not reserved.
   * @param {string} what e.g. "a name", "the name of a thing"
   * @returns {Token}
   */
  expectName(what) {
    const t = this.peek()
    if (t.kind !== 'word' || RESERVED.has(t.text)) throw expected(t, what)
    return this.next()
  }

  /**
   * A number, optionally negative.
   * @param {string} [what='a number']
   * @returns {number}
   */
  expectNumber(what = 'a number') {
    const t = this.peek()
    if (t.kind === 'op' && t.text === '-' && this.peek(1).kind === 'number') {
      this.next()
      return -this.next().value
    }
    if (t.kind !== 'number') throw expected(t, what)
    return this.next().value
  }

  /**
   * A number bigger than 0.
   * @param {string} what
   * @returns {number}
   */
  expectPositive(what) {
    const t = this.peek()
    const value = this.expectNumber(what)
    if (value <= 0) {
      throw fail('bad-number', t.loc, `"${value}" is too small here.`, 'Use a number bigger than 0.')
    }
    return value
  }

  /**
   * @param {string} what
   * @returns {Token}
   */
  expectString(what) {
    const t = this.peek()
    if (t.kind !== 'string') throw expected(t, what)
    return this.next()
  }

  /** Consume the end of the line (or stop at the end of the file). */
  expectEndOfLine() {
    const t = this.peek()
    if (t.kind === 'newline') this.next()
    else if (t.kind !== 'eof') throw expected(t, 'the end of the line')
  }

  atLineEnd() {
    const k = this.peek().kind
    return k === 'newline' || k === 'eof' || k === 'dedent'
  }

  /** Advance past the next newline, or to the end of the file. */
  skipLine() {
    while (true) {
      const t = this.peek()
      if (t.kind === 'eof') return
      this.next()
      if (t.kind === 'newline') return
    }
  }

  /** Skip this line and any block indented under it. */
  skipBlock() {
    this.skipLine()
    if (this.peek().kind !== 'indent') return
    let depth = 0
    while (this.peek().kind !== 'eof') {
      const t = this.next()
      if (t.kind === 'indent') depth++
      else if (t.kind === 'dedent' && --depth === 0) return
    }
  }
}
