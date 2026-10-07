// Expressions and conditions. See docs/spec.md section 4.6.
// `and` / `or` join conditions, never numbers.

import { didYouMean } from './errors.js'
import { KEY_NAMES, MAX_PADS, PAD_BUTTONS, isKeyName, isPadButton } from './keys.js'
import { Cursor, expected, fail } from './cursor.js'

/** @import { Condition, Expr, InstanceProp, KeyChoice } from './ast.js' */
/** @import { MouseButton, PadButton } from './keys.js' */
/** @import { Token } from './lexer.js' */

/** @type {ReadonlySet<string>} */
export const PROP_WORDS = new Set(['x', 'y', 'vx', 'vy', 'width', 'height'])

const KEY_LIST_HINT =
  'Keys are: left, right, up, down, space, enter, shift, escape, tab, backspace, delete, ctrl, alt, a to z, 0 to 9, or any.'
const PAD_LIST_HINT = `Gamepad buttons are: ${PAD_BUTTONS.join(', ')}.`
const MOUSE_BUTTON_WORDS = new Set(['left', 'right', 'middle'])

/**
 * @param {Cursor} c
 * @returns {Expr}
 */
export function parseExpr(c) {
  let left = parseTerm(c)
  while (c.peek().kind === 'op' && (c.peek().text === '+' || c.peek().text === '-')) {
    const op = /** @type {'+' | '-'} */ (c.next().text)
    left = { kind: 'binary', op, left, right: parseTerm(c), loc: left.loc }
  }
  return left
}

/**
 * @param {Cursor} c
 * @returns {Expr}
 */
function parseTerm(c) {
  let left = parseFactor(c)
  while (c.peek().kind === 'op' && (c.peek().text === '*' || c.peek().text === '/')) {
    const op = /** @type {'*' | '/'} */ (c.next().text)
    left = { kind: 'binary', op, left, right: parseFactor(c), loc: left.loc }
  }
  return left
}

/**
 * @param {Cursor} c
 * @returns {Expr}
 */
function parseFactor(c) {
  const t = c.peek()
  const loc = t.loc
  if (t.kind === 'op' && t.text === '-') {
    c.next()
    if (c.peek().kind === 'number') return { kind: 'number', value: -c.next().value, loc }
    return { kind: 'binary', op: '-', left: { kind: 'number', value: 0, loc }, right: parseFactor(c), loc }
  }
  if (t.kind === 'number') {
    c.next()
    return { kind: 'number', value: t.value, loc }
  }
  if (c.acceptWord('random')) {
    const min = parseExpr(c)
    c.expectWord('to', 'Write it like: random 1 to 6')
    const max = parseExpr(c)
    return { kind: 'random', min, max, loc }
  }
  if (c.acceptWord('count')) {
    c.expectWord('of', 'Write it like: count of coin')
    c.acceptWord('the')
    const thing = c.expectName('the name of a thing').text
    return { kind: 'count', thing, loc }
  }
  if (c.isWord('gamepad') && isStickAhead(c)) return parseStick(c)
  if (c.acceptWord('mouse')) {
    const axis = c.peek()
    if (axis.kind !== 'word' || (axis.text !== 'x' && axis.text !== 'y')) throw expected(axis, '"x" or "y"')
    c.next()
    return { kind: 'mouse', axis: /** @type {'x' | 'y'} */ (axis.text), loc }
  }
  const hasThe = c.acceptWord('the')
  const name = c.expectName(hasThe ? 'the name of a thing' : 'a number')
  const after = c.peek()
  if (after.kind === 'word' && PROP_WORDS.has(after.text)) {
    c.next()
    return { kind: 'prop', thing: name.text, prop: /** @type {InstanceProp} */ (after.text), loc }
  }
  return { kind: 'var', name: name.text, loc }
}

/**
 * @param {Cursor} c
 * @returns {Condition}
 */
export function parseCondition(c) {
  let left = parseAndCondition(c)
  while (c.acceptWord('or')) {
    left = { kind: 'or', left, right: parseAndCondition(c), loc: left.loc }
  }
  return left
}

/**
 * @param {Cursor} c
 * @returns {Condition}
 */
function parseAndCondition(c) {
  let left = parseUnary(c)
  while (c.acceptWord('and')) {
    left = { kind: 'and', left, right: parseUnary(c), loc: left.loc }
  }
  return left
}

/**
 * @param {Cursor} c
 * @returns {Condition}
 */
function parseUnary(c) {
  const t = c.peek()
  if (c.acceptWord('not')) return { kind: 'not', operand: parseUnary(c), loc: t.loc }
  return parseAtom(c)
}

/**
 * @param {Cursor} c
 * @returns {Condition}
 */
function parseAtom(c) {
  const loc = c.peek().loc
  if (c.isWord('key', 1)) {
    const key = parseKeyName(c)
    c.expectWord('key')
    c.expectWord('is')
    c.expectWord('held', 'Inside a condition, only "is held" works for keys.')
    return { kind: 'keyHeld', key, loc }
  }
  if (isMouseAhead(c) && !c.isWord('x', 1) && !c.isWord('y', 1)) {
    const button = parseMouseButton(c)
    c.expectWord('is')
    if (button === 'left' && c.acceptWord('over')) {
      c.acceptWord('the')
      return { kind: 'mouseOver', thing: c.expectName('the name of a thing').text, loc }
    }
    c.expectWord('held', 'Inside a condition, write "mouse is held" or "mouse is over coin".')
    return { kind: 'mouseHeld', button, loc }
  }
  if (c.isWord('gamepad') && !isStickAhead(c)) {
    const { pad, button } = parsePadButton(c)
    c.expectWord('is')
    c.expectWord('held', 'Inside a condition, only "is held" works for gamepad buttons.')
    return { kind: 'padHeld', pad, button, loc }
  }
  const o = c.isWord('the') ? 1 : 0
  if (c.peek(o).kind === 'word' && c.isWord('is', o + 1) && c.isWord('held', o + 2)) {
    c.acceptWord('the')
    const name = c.expectName('the name of a control').text
    c.pos += 2 // is held
    return { kind: 'controlHeld', name, loc }
  }
  if (c.peek(o).kind === 'word' && c.isWord('is', o + 1) && c.isWord('on', o + 2)) {
    c.acceptWord('the')
    const thing = c.expectName('the name of a thing').text
    c.pos += 2 // is on
    c.acceptWord('the')
    c.expectWord('ground')
    return { kind: 'onGround', thing, loc }
  }
  const left = parseExpr(c)
  c.expectWord('is')
  /** @type {import('./ast.js').CompareOp} */
  let op = 'is'
  if (c.acceptWord('not')) op = 'isNot'
  else if (c.acceptWord('above')) op = 'above'
  else if (c.acceptWord('below')) op = 'below'
  else if (c.isWord('more') || c.isWord('greater') || c.isWord('bigger')) {
    c.next()
    c.expectWord('than')
    op = 'above'
  } else if (c.isWord('less') || c.isWord('smaller')) {
    c.next()
    c.expectWord('than')
    op = 'below'
  }
  const right = parseExpr(c)
  return { kind: 'compare', op, left, right, loc }
}

/**
 * A key name before the word `key`. Digit keys arrive as number tokens. `any` means any key.
 * @param {Cursor} c
 * @returns {KeyChoice}
 */
export function parseKeyName(c) {
  const t = c.peek()
  /** @type {string} */
  let word
  if (t.kind === 'word') word = t.text
  else if (t.kind === 'number') word = String(t.value)
  else throw expected(t, 'a key name', KEY_LIST_HINT)
  if (word === 'any') {
    c.next()
    return 'any'
  }
  if (!isKeyName(word)) {
    throw fail('unknown-key', t.loc, `I don't know the key "${word}".`, didYouMean(word, KEY_NAMES) ?? KEY_LIST_HINT)
  }
  c.next()
  return word
}

/**
 * True at `mouse is ...` or `left|right|middle mouse ...`.
 * @param {Cursor} c
 */
export function isMouseAhead(c) {
  const t = c.peek()
  if (c.isWord('mouse')) return c.isWord('is', 1)
  return t.kind === 'word' && MOUSE_BUTTON_WORDS.has(t.text) && c.isWord('mouse', 1)
}

/**
 * `[left|right|middle] mouse`. Plain `mouse` is the left button.
 * @param {Cursor} c
 * @returns {MouseButton}
 */
export function parseMouseButton(c) {
  /** @type {MouseButton} */
  let button = 'left'
  const t = c.peek()
  if (t.kind === 'word' && MOUSE_BUTTON_WORDS.has(t.text)) {
    button = /** @type {MouseButton} */ (t.text)
    c.next()
  }
  c.expectWord('mouse')
  return button
}

/**
 * Optional gamepad number after `gamepad` (1 to 4). Defaults to 1.
 * @param {Cursor} c
 * @returns {number}
 */
function parsePadNumber(c) {
  const t = c.peek()
  if (t.kind !== 'number') return 1
  c.next()
  if (!Number.isInteger(t.value) || t.value < 1 || t.value > MAX_PADS) {
    throw fail('bad-number', t.loc, `There is no gamepad ${t.value}.`, `Gamepads are numbered 1 to ${MAX_PADS}.`)
  }
  return t.value
}

/**
 * Is this `gamepad [N] [left|right] stick ...`?
 * @param {Cursor} c
 */
function isStickAhead(c) {
  let o = 1
  if (c.peek(o).kind === 'number') o++
  if (c.isWord('left', o) || c.isWord('right', o)) o++
  return c.isWord('stick', o)
}

/**
 * `gamepad [N] [left|right] stick x|y`: -1 to 1, 0 in the middle.
 * @param {Cursor} c
 * @returns {Expr}
 */
function parseStick(c) {
  const loc = c.next().loc // gamepad
  const pad = parsePadNumber(c)
  /** @type {'left' | 'right'} */
  let side = 'left'
  if (c.isWord('left') || c.isWord('right')) side = /** @type {'left' | 'right'} */ (c.next().text)
  c.expectWord('stick')
  const axis = c.peek()
  if (axis.kind !== 'word' || (axis.text !== 'x' && axis.text !== 'y')) throw expected(axis, '"x" or "y"')
  c.next()
  return { kind: 'stick', pad, side, axis: /** @type {'x' | 'y'} */ (axis.text), loc }
}

/**
 * `gamepad [N] BUTTON`, after checking the next word is `gamepad`.
 * @param {Cursor} c
 * @returns {{ pad: number; button: PadButton }}
 */
export function parsePadButton(c) {
  c.expectWord('gamepad')
  const pad = parsePadNumber(c)
  const t = c.peek()
  if (t.kind !== 'word') throw expected(t, 'a gamepad button like "a" or "start"', PAD_LIST_HINT)
  if (!isPadButton(t.text)) {
    throw fail(
      'unknown-button',
      t.loc,
      `I don't know the gamepad button "${t.text}".`,
      didYouMean(t.text, PAD_BUTTONS) ?? PAD_LIST_HINT,
    )
  }
  c.next()
  return { pad, button: t.text }
}
