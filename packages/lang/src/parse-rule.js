// Triggers, actions, looks and text interpolation. See docs/spec.md section 4.6.

import { DEFAULT_TEXT_COLOR } from './ast.js'
import { CSS_COLOR_NAMES, normalizeColor } from './colors.js'
import { Cursor, ParseError, expected, fail } from './cursor.js'
import { didYouMean } from './errors.js'
import { lex } from './lexer.js'
import { PROP_WORDS, isMouseAhead, parseCondition, parseExpr, parseKeyName, parseMouseButton, parsePadButton } from './parse-expr.js'

/** @import { Action, Condition, Direction, Expr, Look, SettableProp, TextPart, Trigger } from './ast.js' */
/** @import { Token } from './lexer.js' */

export const ACTION_WORDS = [
  'move',
  'push',
  'stop',
  'set',
  'add',
  'subtract',
  'make',
  'remove',
  'change',
  'play',
  'show',
  'log',
  'restart',
]

const DIRECTIONS = new Set(['left', 'right', 'up', 'down'])
const SETTABLE = new Set(['x', 'y', 'vx', 'vy'])
const THING = 'the name of a thing'
const NUMBER_NAME = 'the name of a number'

/**
 * Parse a trigger after `when` was consumed. Does not consume the end of the line.
 * Event triggers are tried first; anything else is a rising-edge condition.
 * @param {Cursor} c
 * @returns {Trigger}
 */
export function parseTrigger(c) {
  const loc = c.peek().loc
  if (c.acceptWords('game', 'starts')) return { kind: 'gameStarts', guard: parseGuard(c), loc }
  if (isMouseEventAhead(c)) {
    const button = parseMouseButton(c)
    c.expectWord('is')
    const state = c.acceptWord('clicked') ? 'pressed' : parseState(c, '"clicked", "pressed", "held" or "released"')
    /** @type {string | null} */
    let thing = null
    if (c.acceptWord('on')) {
      c.acceptWord('the')
      thing = c.expectName(THING).text
    }
    return { kind: 'mouseClick', button, state, thing, guard: parseGuard(c), loc }
  }
  if (isPadEventAhead(c)) {
    const { pad, button } = parsePadButton(c)
    c.expectWord('is')
    return { kind: 'pad', pad, button, state: parseState(c), guard: parseGuard(c), loc }
  }
  if (c.isWord('every') || c.isWord('after')) {
    const kind = /** @type {'every' | 'after'} */ (c.next().text)
    const seconds = c.expectPositive('a number of seconds')
    if (!c.acceptWord('seconds') && !c.acceptWord('second')) throw expected(c.peek(), '"seconds"')
    return { kind, seconds, guard: parseGuard(c), loc }
  }
  if (c.isWord('key', 1)) {
    const key = parseKeyName(c)
    c.expectWord('key')
    c.expectWord('is')
    return { kind: 'key', key, state: parseState(c), guard: parseGuard(c), loc }
  }
  const o = c.isWord('the') ? 1 : 0
  if (c.peek(o).kind === 'word' && c.isWord('is', o + 1) && STATES.has(c.peek(o + 2).text) && c.peek(o + 2).kind === 'word') {
    c.acceptWord('the')
    const name = c.expectName('the name of a control').text
    c.expectWord('is')
    return { kind: 'control', name, state: parseState(c), guard: parseGuard(c), loc }
  }
  if (c.peek(o).kind === 'word' && c.isWord('touches', o + 1)) {
    c.acceptWord('the')
    const a = c.expectName(THING).text
    c.expectWord('touches')
    c.acceptWord('the')
    const b = c.expectName(THING).text
    return { kind: 'touch', a, b, guard: parseGuard(c), loc }
  }
  if (c.peek(o).kind === 'word' && c.isWord('leaves', o + 1)) {
    c.acceptWord('the')
    const thing = c.expectName(THING).text
    c.expectWord('leaves')
    c.acceptWord('the')
    c.expectWord('screen')
    return { kind: 'leavesScreen', thing, guard: parseGuard(c), loc }
  }
  return { kind: 'condition', condition: parseCondition(c), loc }
}

const STATES = new Set(['pressed', 'held', 'released'])

/**
 * @param {Cursor} c
 * @param {string} [what]
 * @returns {'pressed' | 'held' | 'released'}
 */
function parseState(c, what = '"pressed", "held" or "released"') {
  const t = c.peek()
  if (t.kind !== 'word' || !STATES.has(t.text)) throw expected(t, what)
  c.next()
  return /** @type {'pressed' | 'held' | 'released'} */ (t.text)
}

/**
 * A mouse button event, not a condition like `mouse is over coin` or `mouse x is above 3`.
 * @param {Cursor} c
 */
function isMouseEventAhead(c) {
  if (!isMouseAhead(c)) return false
  const o = c.isWord('mouse') ? 2 : 3
  return c.isWord('clicked', o) || (c.peek(o).kind === 'word' && STATES.has(c.peek(o).text))
}

/**
 * `gamepad [N] BUTTON is ...`, not `gamepad stick x is above 0.5`.
 * @param {Cursor} c
 */
function isPadEventAhead(c) {
  if (!c.isWord('gamepad')) return false
  let o = 1
  if (c.peek(o).kind === 'number') o++
  return c.isWord('is', o + 1)
}

/**
 * @param {Cursor} c
 * @returns {Condition | null}
 */
function parseGuard(c) {
  return c.acceptWord('and') ? parseCondition(c) : null
}

/**
 * @param {Cursor} c
 * @returns {Direction}
 */
function parseDirection(c) {
  const t = c.peek()
  if (t.kind !== 'word' || !DIRECTIONS.has(t.text)) throw expected(t, 'a direction (left, right, up or down)')
  c.next()
  return /** @type {Direction} */ (t.text)
}

/**
 * A thing name with an optional leading `the`.
 * @param {Cursor} c
 * @returns {string}
 */
function thingName(c) {
  c.acceptWord('the')
  return c.expectName(THING).text
}

/**
 * One action line. Does not consume the end of the line.
 * @param {Cursor} c
 * @returns {Action}
 */
export function parseAction(c) {
  const first = c.peek()
  const loc = first.loc
  if (first.kind !== 'word') throw expected(first, 'an action like "move" or "show"')
  switch (first.text) {
    case 'move':
    case 'push': {
      c.next()
      const thing = thingName(c)
      const dir = parseDirection(c)
      return { kind: first.text, thing, dir, amount: parseExpr(c), loc }
    }
    case 'stop': {
      c.next()
      if (c.acceptWord('game')) return { kind: 'stopGame', loc }
      if (c.isWord('animation') && c.isWord('on', 1)) {
        c.pos += 2
        return { kind: 'stopAnimation', thing: thingName(c), loc }
      }
      return { kind: 'halt', thing: thingName(c), loc }
    }
    case 'restart': {
      c.next()
      c.expectWord('game')
      return { kind: 'restartGame', loc }
    }
    case 'set': {
      c.next()
      const o = c.isWord('the') ? 1 : 0
      const propWord = c.peek(o + 1)
      if (c.peek(o).kind === 'word' && propWord.kind === 'word' && PROP_WORDS.has(propWord.text)) {
        const thing = thingName(c)
        if (!SETTABLE.has(propWord.text)) {
          throw expected(propWord, 'x, y, vx or vy', 'You can only set x, y, vx or vy.')
        }
        c.next()
        c.expectWord('to')
        return { kind: 'setProp', thing, prop: /** @type {SettableProp} */ (propWord.text), value: parseExpr(c), loc }
      }
      const name = c.expectName(NUMBER_NAME).text
      c.expectWord('to')
      return { kind: 'setVar', name, value: parseExpr(c), loc }
    }
    case 'add': {
      c.next()
      const amount = parseExpr(c)
      c.expectWord('to')
      return { kind: 'addVar', name: c.expectName(NUMBER_NAME).text, amount, loc }
    }
    case 'subtract': {
      c.next()
      const amount = parseExpr(c)
      c.expectWord('from')
      return { kind: 'subtractVar', name: c.expectName(NUMBER_NAME).text, amount, loc }
    }
    case 'make': {
      c.next()
      // `a` / `an` are fillers unless they are the thing's own name (`make a at 1, 2`).
      if ((c.isWord('a') || c.isWord('an')) && c.peek(1).kind === 'word' && !c.isWord('at', 1)) c.next()
      const thing = c.expectName(THING).text
      c.expectWord('at')
      const x = parseExpr(c)
      expectComma(c)
      const y = parseExpr(c)
      return { kind: 'make', thing, x, y, loc }
    }
    case 'remove': {
      c.next()
      return { kind: 'remove', thing: thingName(c), loc }
    }
    case 'change': {
      c.next()
      const thing = thingName(c)
      c.expectWord('to')
      c.expectWord('look')
      c.expectWord('like')
      return { kind: 'changeLook', thing, look: parseLook(c), loc }
    }
    case 'play': {
      c.next()
      const animation = c.expectName('the name of an animation').text
      c.expectWord('on')
      return { kind: 'playAnimation', thing: thingName(c), animation, loc }
    }
    case 'log': {
      c.next()
      return { kind: 'log', parts: parseText(c.expectString('some text in quotes, like "score is {score}"')), loc }
    }
    case 'show': {
      c.next()
      c.expectWord('text')
      const parts = parseText(c.expectString('some text in quotes, like "Hello"'))
      /** @type {{ x: Expr; y: Expr } | null} */
      let at = null
      if (c.acceptWord('at')) {
        const x = parseExpr(c)
        expectComma(c)
        at = { x, y: parseExpr(c) }
      }
      const color = c.acceptWord('in') ? parseColorWords(c, 'a color') : DEFAULT_TEXT_COLOR
      return { kind: 'showText', parts, at, color, loc }
    }
  }
  throw fail(
    'unknown-word',
    loc,
    `I don't know how to "${first.text}".`,
    didYouMean(first.text, ACTION_WORDS) ??
      'Actions start with: move, push, stop, set, add, subtract, make, remove, change, play, show, log, restart.',
  )
}

/** @param {Cursor} c */
function expectComma(c) {
  if (c.peek().kind !== 'comma') throw expected(c.peek(), 'a comma', 'Write a position like: 40, 100')
  c.next()
}

/**
 * A look, after `looks like` / `to look like`: an image path, or a colored box or circle.
 * @param {Cursor} c
 * @returns {Look}
 */
export function parseLook(c) {
  const t = c.peek()
  const loc = t.loc
  if (t.kind === 'string') {
    c.next()
    return { kind: 'image', src: t.text, loc }
  }
  const color = parseColorWords(c, 'a color or a picture in quotes')
  if (c.acceptWord('box')) {
    const w = c.expectPositive('a width')
    c.expectWord('by')
    const h = c.expectPositive('a height')
    return { kind: 'box', color, w, h, loc }
  }
  if (c.acceptWord('circle')) return { kind: 'circle', color, r: c.expectPositive('a size'), loc }
  throw expected(c.peek(), '"box" or "circle"')
}

/**
 * A color: one color token, or color words up to `box` / `circle` / the end of the line.
 * @param {Cursor} c
 * @param {string} what
 * @returns {string}
 */
export function parseColorWords(c, what) {
  const first = c.peek()
  if (first.kind === 'color') {
    c.next()
    return first.text
  }
  /** @type {string[]} */
  const words = []
  while (c.peek().kind === 'word' && !c.isWord('box') && !c.isWord('circle')) words.push(c.next().text)
  if (words.length === 0) throw expected(first, what)
  const color = normalizeColor(words)
  if (color === null) {
    throw fail(
      'unknown-color',
      first.loc,
      `I don't know the color "${words.join(' ')}".`,
      didYouMean(words.join(''), CSS_COLOR_NAMES) ?? 'Try a color like red, sky blue, or #ff8800.',
    )
  }
  return color
}

/**
 * Split `{expr}` interpolation out of a string token. `{{` is a literal `{`; a lone `}` is literal.
 * @param {Token} token
 * @returns {TextPart[]}
 */
export function parseText(token) {
  const text = token.text
  /** @type {TextPart[]} */
  const parts = []
  let literal = ''
  let i = 0
  /** @param {number} offset index into the text */
  const colAt = (offset) => token.loc.col + 1 + offset
  while (i < text.length) {
    const ch = text[i]
    if (ch === '{' && text[i + 1] === '{') {
      literal += '{'
      i += 2
      continue
    }
    if (ch !== '{') {
      literal += ch
      i++
      continue
    }
    const close = text.indexOf('}', i + 1)
    if (close === -1) {
      throw fail(
        'expected',
        { line: token.loc.line, col: colAt(i) },
        'I expected "}" to close the "{" in this text.',
        'Use {score} to show a number inside text.',
      )
    }
    if (literal) parts.push({ kind: 'literal', text: literal })
    literal = ''
    parts.push({ kind: 'expr', expr: parseInner(text.slice(i + 1, close), token.loc.line, colAt(i + 1)) })
    i = close + 1
  }
  if (literal) parts.push({ kind: 'literal', text: literal })
  return parts
}

/**
 * Parse the text between `{` and `}` as one expression, with locs inside the string.
 * @param {string} inner
 * @param {number} line
 * @param {number} startCol column of the first inner character
 * @returns {Expr}
 */
function parseInner(inner, line, startCol) {
  /** @param {import('./ast.js').Loc} loc */
  const shift = (loc) => ({ line, col: startCol + loc.col - 1 })
  const { tokens, errors } = lex(inner)
  if (errors.length > 0) {
    const first = errors[0]
    throw new ParseError({ ...first, ...shift({ line: first.line, col: first.col }) })
  }
  // Keep the words, then end the line where the "}" is.
  const body = tokens.filter((t) => t.kind !== 'newline' && t.kind !== 'eof' && t.kind !== 'indent' && t.kind !== 'dedent')
  const endLoc = { line, col: startCol + inner.length }
  const shifted = body.map((t) => ({ ...t, loc: shift(t.loc) }))
  shifted.push({ kind: 'newline', text: '', value: 0, loc: endLoc })
  shifted.push({ kind: 'eof', text: '', value: 0, loc: endLoc })
  const c = new Cursor(shifted)
  const expr = parseExpr(c)
  if (c.peek().kind !== 'newline') throw expected(c.peek(), '"}"')
  return expr
}
