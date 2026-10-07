// Every way a game can listen to people: keys, mouse buttons, gamepads, controls.
import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'
import { parseCondition, parseExpr } from '../src/parse-expr.js'
import { parseAction, parseTrigger } from '../src/parse-rule.js'
import { cursor, parseErrorOf, strip } from './helpers.js'

/** @param {string} src */
const trig = (src) => strip(parseTrigger(cursor(src)))
/** @param {string} src */
const cond = (src) => strip(parseCondition(cursor(src)))
/** @param {string} src */
const expr = (src) => strip(parseExpr(cursor(src)))

describe('keys', () => {
  it('knows the extra keys and "any key"', () => {
    expect(trig('tab key is pressed')).toMatchObject({ kind: 'key', key: 'tab' })
    expect(trig('ctrl key is held')).toMatchObject({ key: 'ctrl', state: 'held' })
    expect(trig('backspace key is released')).toMatchObject({ key: 'backspace', state: 'released' })
    expect(trig('any key is pressed')).toEqual({ kind: 'key', key: 'any', state: 'pressed', guard: null })
    expect(cond('any key is held')).toEqual({ kind: 'keyHeld', key: 'any' })
  })
  it('builds combos from guards', () => {
    expect(trig('s key is pressed and ctrl key is held and not shift key is held')).toEqual({
      kind: 'key',
      key: 's',
      state: 'pressed',
      guard: {
        kind: 'and',
        left: { kind: 'keyHeld', key: 'ctrl' },
        right: { kind: 'not', operand: { kind: 'keyHeld', key: 'shift' } },
      },
    })
  })
})

describe('mouse', () => {
  it('parses every button and state', () => {
    expect(trig('mouse is pressed')).toEqual({ kind: 'mouseClick', button: 'left', state: 'pressed', thing: null, guard: null })
    expect(trig('mouse is held')).toMatchObject({ button: 'left', state: 'held' })
    expect(trig('mouse is released')).toMatchObject({ button: 'left', state: 'released' })
    expect(trig('right mouse is clicked')).toMatchObject({ button: 'right', state: 'pressed' })
    expect(trig('middle mouse is held on the crate')).toMatchObject({ button: 'middle', state: 'held', thing: 'crate' })
    expect(trig('left mouse is released on button and score is 1')).toMatchObject({
      button: 'left',
      state: 'released',
      thing: 'button',
      guard: { kind: 'compare' },
    })
  })
  it('parses mouse conditions', () => {
    expect(cond('mouse is held')).toEqual({ kind: 'mouseHeld', button: 'left' })
    expect(cond('right mouse is held')).toEqual({ kind: 'mouseHeld', button: 'right' })
    expect(cond('mouse is over the coin')).toEqual({ kind: 'mouseOver', thing: 'coin' })
    expect(trig('mouse is over coin')).toEqual({ kind: 'condition', condition: { kind: 'mouseOver', thing: 'coin' } })
    expect(trig('mouse x is above 100')).toMatchObject({ kind: 'condition', condition: { kind: 'compare' } })
  })
  it('explains a bad mouse state', () => {
    expect(parseErrorOf(() => parseTrigger(cursor('mouse is tapped')))).toMatchObject({ code: 'expected' })
  })
})

describe('gamepads', () => {
  it('parses buttons on pad 1 and numbered pads', () => {
    expect(trig('gamepad a is pressed')).toEqual({ kind: 'pad', pad: 1, button: 'a', state: 'pressed', guard: null })
    expect(trig('gamepad 2 start is released')).toMatchObject({ pad: 2, button: 'start', state: 'released' })
    expect(trig('gamepad up is held and gamepad rb is held')).toMatchObject({
      button: 'up',
      guard: { kind: 'padHeld', pad: 1, button: 'rb' },
    })
    expect(cond('gamepad 4 x is held')).toEqual({ kind: 'padHeld', pad: 4, button: 'x' })
  })
  it('reads sticks as numbers', () => {
    expect(expr('gamepad stick x')).toEqual({ kind: 'stick', pad: 1, side: 'left', axis: 'x' })
    expect(expr('gamepad 2 right stick y * 3')).toMatchObject({
      op: '*',
      left: { kind: 'stick', pad: 2, side: 'right', axis: 'y' },
    })
    expect(trig('gamepad left stick x is below -0.5')).toMatchObject({
      kind: 'condition',
      condition: { left: { kind: 'stick', side: 'left' }, op: 'below', right: { value: -0.5 } },
    })
    expect(strip(parseAction(cursor('move player right gamepad stick x * 3')))).toMatchObject({
      amount: { op: '*', left: { kind: 'stick' } },
    })
  })
  it('reports unknown buttons and pads', () => {
    expect(parseErrorOf(() => parseTrigger(cursor('gamepad strat is pressed')))).toEqual({
      code: 'unknown-button',
      message: 'I don\'t know the gamepad button "strat".',
      hint: 'Did you mean "start"?',
      line: 1,
      col: 9,
    })
    expect(parseErrorOf(() => parseTrigger(cursor('gamepad banana is pressed')))).toMatchObject({
      hint: 'Gamepad buttons are: a, b, x, y, lb, rb, lt, rt, select, start, ls, rs, up, down, left, right.',
    })
    expect(parseErrorOf(() => parseTrigger(cursor('gamepad 5 a is pressed')))).toEqual({
      code: 'bad-number',
      message: 'There is no gamepad 5.',
      hint: 'Gamepads are numbered 1 to 4.',
      line: 1,
      col: 9,
    })
  })
})

describe('controls', () => {
  const SRC = [
    'thing player',
    '  looks like red box 4 by 4',
    'control jump',
    '  space key',
    '  up key',
    '  gamepad a',
    '  gamepad 2 b',
    '  mouse',
    '  right mouse',
    'control anything',
    '  any key',
    'when jump is pressed and player is on ground',
    '  push player up 6',
    'when the jump is released',
    '  stop player',
    'when jump is held and not anything is held',
    '  log "holding jump at {player y}"',
  ].join('\n')

  it('compiles a control block and uses it', () => {
    const { program, errors } = compile(SRC)
    expect(errors).toEqual([])
    expect(strip(program?.controls)).toEqual([
      {
        name: 'jump',
        sources: [
          { kind: 'key', key: 'space' },
          { kind: 'key', key: 'up' },
          { kind: 'pad', pad: 1, button: 'a' },
          { kind: 'pad', pad: 2, button: 'b' },
          { kind: 'mouse', button: 'left' },
          { kind: 'mouse', button: 'right' },
        ],
      },
      { name: 'anything', sources: [{ kind: 'key', key: 'any' }] },
    ])
    expect(strip(program?.rules.map((r) => r.trigger))).toEqual([
      { kind: 'control', name: 'jump', state: 'pressed', guard: { kind: 'onGround', thing: 'player' } },
      { kind: 'control', name: 'jump', state: 'released', guard: null },
      // Event triggers win, like keys: fires every tick while held, guarded.
      {
        kind: 'control',
        name: 'jump',
        state: 'held',
        guard: { kind: 'not', operand: { kind: 'controlHeld', name: 'anything' } },
      },
    ])
    expect(strip(program?.rules[2].actions[0])).toEqual({
      kind: 'log',
      parts: [
        { kind: 'literal', text: 'holding jump at ' },
        { kind: 'expr', expr: { kind: 'prop', thing: 'player', prop: 'y' } },
      ],
    })
  })

  it('reports unknown controls with suggestions', () => {
    expect(compile('control jump\n  space key\nwhen jmup is pressed\n  stop game\n').errors).toEqual([
      {
        code: 'unknown-control',
        message: 'I don\'t know the control "jmup".',
        hint: 'Did you mean "jump"?',
        line: 3,
        col: 6,
      },
    ])
    expect(compile('when fire is held\n  stop game\n').errors[0].hint).toBe('Make it first with a block like: control fire')
    expect(compile('score starts at 0\nwhen score is held\n  stop game\n').errors[0]).toMatchObject({
      code: 'unknown-control',
      message: '"score" is a number, not a control.',
    })
  })

  it('reports duplicates, clashes and empty controls', () => {
    expect(compile('control a1\n  space key\ncontrol a1\n  up key\n').errors.map((e) => [e.code, e.line])).toEqual([
      ['duplicate-control', 3],
    ])
    expect(
      compile('thing jump\n  looks like red box 1 by 1\ncontrol jump\n  space key\n').errors.map((e) => e.code),
    ).toEqual(['name-clash'])
    expect(compile('control jump\n').errors[0]).toMatchObject({
      code: 'expected',
      message: 'I expected some keys or buttons under this line.',
    })
    expect(compile('control jump\n  banana\n').errors[0]).toMatchObject({
      code: 'expected',
      message: 'I expected a key or button, like "space key", "mouse" or "gamepad a" here, but found "banana".',
    })
    expect(compile('control left\n  a key\n').errors[0]).toMatchObject({ code: 'name-clash', hint: 'Pick another name, like left-button.' })
  })

  it('knows a control is not a thing or a number', () => {
    const src = 'control jump\n  space key\nalways\n  remove jump\n  add jump to jump\n'
    expect(compile(src).errors.map((e) => e.message)).toEqual([
      '"jump" is a control, not a thing.',
      '"jump" is a control, not a number.',
      '"jump" is a control, not a number.',
    ])
  })
})

describe('joining events', () => {
  it('points "or" between events at controls', () => {
    expect(compile('when gamepad start is pressed or escape key is pressed\n  restart game\n').errors).toEqual([
      {
        code: 'expected',
        message: '"or" can\'t join two events, like two key presses.',
        hint: 'Make a control that lists both keys or buttons, then use it: when my-control is pressed',
        line: 1,
        col: 31,
      },
    ])
  })
})

describe('touch buttons and log', () => {
  it('reads the touch buttons setting', () => {
    expect(compile('game\n  touch buttons\n').program?.game.touchButtons).toBe(true)
  })
  it('logs text with numbers', () => {
    expect(strip(parseAction(cursor('log "hi {1 + 2}"')))).toEqual({
      kind: 'log',
      parts: [
        { kind: 'literal', text: 'hi ' },
        { kind: 'expr', expr: { kind: 'binary', op: '+', left: { kind: 'number', value: 1 }, right: { kind: 'number', value: 2 } } },
      ],
    })
  })
})
