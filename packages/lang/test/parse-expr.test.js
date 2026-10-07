import { describe, expect, it } from 'vitest'
import { describeToken } from '../src/cursor.js'
import { lex } from '../src/lexer.js'
import { parseCondition, parseExpr } from '../src/parse-expr.js'
import { cursor, parseErrorOf, strip } from './helpers.js'

/** @param {string} src */
const e = (src) => strip(parseExpr(cursor(src)))
/** @param {string} src */
const k = (src) => strip(parseCondition(cursor(src)))

describe('expressions', () => {
  it('respects precedence', () => {
    expect(e('1 + 2 * 3')).toEqual({
      kind: 'binary',
      op: '+',
      left: { kind: 'number', value: 1 },
      right: { kind: 'binary', op: '*', left: { kind: 'number', value: 2 }, right: { kind: 'number', value: 3 } },
    })
  })
  it('is left associative', () => {
    expect(e('8 - 2 - 1')).toMatchObject({ op: '-', left: { op: '-' }, right: { value: 1 } })
  })
  it('handles minus', () => {
    expect(e('-4')).toEqual({ kind: 'number', value: -4 })
    expect(e('- score')).toEqual({
      kind: 'binary',
      op: '-',
      left: { kind: 'number', value: 0 },
      right: { kind: 'var', name: 'score' },
    })
    expect(e('score - 1')).toEqual({
      kind: 'binary',
      op: '-',
      left: { kind: 'var', name: 'score' },
      right: { kind: 'number', value: 1 },
    })
  })
  it('reads props, counts, mouse and random', () => {
    expect(e('player x')).toEqual({ kind: 'prop', thing: 'player', prop: 'x' })
    expect(e('the coin width')).toEqual({ kind: 'prop', thing: 'coin', prop: 'width' })
    expect(e('count of coin')).toEqual({ kind: 'count', thing: 'coin' })
    expect(e('count of the coin')).toEqual({ kind: 'count', thing: 'coin' })
    expect(e('mouse y')).toEqual({ kind: 'mouse', axis: 'y' })
    expect(e('random 0 to 300')).toEqual({
      kind: 'random',
      min: { kind: 'number', value: 0 },
      max: { kind: 'number', value: 300 },
    })
  })
  it('gives binary nodes the left operand loc', () => {
    const node = parseExpr(cursor('a + b'))
    expect(node.loc).toEqual({ line: 1, col: 1 })
  })
})

describe('conditions', () => {
  it('parses comparisons', () => {
    expect(k('score is 10')).toEqual({
      kind: 'compare',
      op: 'is',
      left: { kind: 'var', name: 'score' },
      right: { kind: 'number', value: 10 },
    })
    expect(k('lives is not 0')).toMatchObject({ op: 'isNot' })
    expect(k('player x is above 100')).toMatchObject({ op: 'above' })
    expect(k('player x is more than 100')).toMatchObject({ op: 'above' })
    expect(k('a is greater than 1')).toMatchObject({ op: 'above' })
    expect(k('a is bigger than 1')).toMatchObject({ op: 'above' })
    expect(k('a is below 1')).toMatchObject({ op: 'below' })
    expect(k('a is less than 1')).toMatchObject({ op: 'below' })
    expect(k('score is smaller than 3')).toMatchObject({ op: 'below' })
  })
  it('parses on ground and held keys', () => {
    expect(k('player is on the ground')).toEqual({ kind: 'onGround', thing: 'player' })
    expect(k('the player is on ground')).toEqual({ kind: 'onGround', thing: 'player' })
    expect(k('left key is held')).toEqual({ kind: 'keyHeld', key: 'left' })
    expect(k('a key is held')).toEqual({ kind: 'keyHeld', key: 'a' })
    expect(k('7 key is held')).toEqual({ kind: 'keyHeld', key: '7' })
  })
  it('binds not > and > or', () => {
    expect(k('not a is 1 and b is 2 or c is 3')).toEqual({
      kind: 'or',
      left: {
        kind: 'and',
        left: {
          kind: 'not',
          operand: { kind: 'compare', op: 'is', left: { kind: 'var', name: 'a' }, right: { kind: 'number', value: 1 } },
        },
        right: { kind: 'compare', op: 'is', left: { kind: 'var', name: 'b' }, right: { kind: 'number', value: 2 } },
      },
      right: { kind: 'compare', op: 'is', left: { kind: 'var', name: 'c' }, right: { kind: 'number', value: 3 } },
    })
  })
  it('uses the not word for not nodes', () => {
    expect(parseCondition(cursor('p is 1 and not q is 2'))).toMatchObject({ right: { loc: { line: 1, col: 12 } } })
  })
})

describe('expression errors', () => {
  it('reports unknown keys with a list when nothing is close', () => {
    expect(parseErrorOf(() => parseCondition(cursor('banana key is held')))).toEqual({
      code: 'unknown-key',
      message: 'I don\'t know the key "banana".',
      hint: 'Keys are: left, right, up, down, space, enter, shift, escape, tab, backspace, delete, ctrl, alt, a to z, 0 to 9, or any.',
      line: 1,
      col: 1,
    })
  })
  it('suggests close keys', () => {
    expect(parseErrorOf(() => parseCondition(cursor('spcae key is held')))).toMatchObject({
      code: 'unknown-key',
      hint: 'Did you mean "space"?',
    })
  })
  it('reports a missing number', () => {
    expect(parseErrorOf(() => parseCondition(cursor('score is')))).toEqual({
      code: 'expected',
      message: 'I expected a number here, but found the end of the line.',
      hint: null,
      line: 1,
      col: 9,
    })
  })
  it('describes tokens in plain words', () => {
    const t = lex('move 5 "hi" #abc , + ').tokens
    expect(t.map(describeToken)).toEqual([
      '"move"',
      'the number 5',
      'some text',
      'the color #abc',
      'a comma',
      '"+"',
      'the end of the line',
      'the end of the file',
    ])
  })
})
