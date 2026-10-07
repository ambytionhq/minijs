import { describe, expect, it } from 'vitest'
import { check } from '../src/checker.js'
import { lex } from '../src/lexer.js'
import { parse } from '../src/parser.js'
import { SPEC_EXAMPLE } from './fixtures.js'

/** @param {string} src */
function checked(src) {
  const { program, errors } = parse(lex(src).tokens)
  expect(errors).toEqual([])
  return check(program)
}

const COIN = 'thing coin\n  looks like gold circle 4\n'
const PLAYER = 'thing player\n  looks like red box 4 by 4\n'

describe('checker', () => {
  it('accepts the spec example', () => {
    expect(checked(SPEC_EXAMPLE)).toEqual([])
  })

  it('reports duplicate things at the second one', () => {
    expect(checked(COIN + COIN)).toEqual([
      {
        code: 'duplicate-thing',
        message: 'There are two things called "coin".',
        hint: 'Give each thing its own name.',
        line: 3,
        col: 1,
      },
    ])
  })

  it('reports duplicate variables', () => {
    expect(checked('score starts at 0\nscore starts at 1\n')).toEqual([
      {
        code: 'duplicate-variable',
        message: 'There are two numbers called "score".',
        hint: 'Give each number its own name.',
        line: 2,
        col: 1,
      },
    ])
  })

  it('reports a number named like a thing', () => {
    expect(checked(COIN + 'coin starts at 0\n')).toEqual([
      {
        code: 'name-clash',
        message: '"coin" is used as both a thing and a number.',
        hint: 'Rename one of them.',
        line: 3,
        col: 1,
      },
    ])
  })

  it('reports a second camera', () => {
    expect(checked('thing hero\n  looks like red box 1 by 1\n  camera follows\nthing enemy\n  looks like red box 1 by 1\n  camera follows\n')).toEqual([
      {
        code: 'multiple-cameras',
        message: 'Only one thing can have "camera follows".',
        hint: 'Remove "camera follows" from "enemy".',
        line: 4,
        col: 1,
      },
    ])
  })

  it('suggests close thing names (spec 4.7)', () => {
    expect(checked(COIN + 'always\n  remove cion\n')).toEqual([
      {
        code: 'unknown-thing',
        message: 'I don\'t know what "cion" is.',
        hint: 'Did you mean "coin"?',
        line: 4,
        col: 3,
      },
    ])
  })

  it('explains unknown things with no close match', () => {
    expect(checked('always\n  remove dragon\n')[0]).toMatchObject({
      code: 'unknown-thing',
      hint: 'Add a "thing dragon" block, or check the spelling.',
    })
  })

  it('reports a number used as a thing', () => {
    expect(checked('score starts at 0\nalways\n  remove score\n')).toEqual([
      { code: 'unknown-thing', message: '"score" is a number, not a thing.', hint: null, line: 3, col: 3 },
    ])
  })

  it('reports unknown variables', () => {
    expect(checked('score starts at 0\nalways\n  add 1 to scroe\n')).toEqual([
      {
        code: 'unknown-variable',
        message: 'I don\'t know what "scroe" is.',
        hint: 'Did you mean "score"?',
        line: 3,
        col: 3,
      },
    ])
    expect(checked('always\n  add 1 to lives\n')[0].hint).toBe('Make it first with a line like: lives starts at 0')
  })

  it('reports a thing used as a number', () => {
    expect(checked(PLAYER + 'when player is 3\n  stop game\n')).toEqual([
      {
        code: 'unknown-variable',
        message: '"player" is a thing, not a number.',
        hint: 'Did you mean "player x"?',
        line: 3,
        col: 6,
      },
    ])
  })

  it('reports unknown animations', () => {
    const hero = 'thing hero\n  looks like "a.png"\n  animation spin "a.png" at 4 fps\n'
    expect(checked(hero + 'always\n  play sipn on hero\n')).toEqual([
      {
        code: 'unknown-animation',
        message: '"hero" has no animation called "sipn".',
        hint: 'Did you mean "spin"?',
        line: 5,
        col: 3,
      },
    ])
    expect(checked(hero + 'always\n  play walk on hero\n')[0].hint).toBe(
      'Add a line like: animation walk "a.png", "b.png" at 8 fps',
    )
  })

  it('walks guards, conditions, text and positions', () => {
    const src =
      PLAYER +
      'when up key is pressed and ghost is on ground\n  stop game\n' +
      'when lives is 0 or player y is above 3\n  stop game\n' +
      'always\n  show text "{hp}" at count of bat, 4\n' +
      'when player touches wall\n  stop game\n'
    expect(check(parse(lex(src).tokens).program).map((e) => [e.code, e.line])).toEqual([
      ['unknown-thing', 3],
      ['unknown-variable', 5],
      ['unknown-variable', 8],
      ['unknown-thing', 8],
      ['unknown-thing', 9],
    ])
  })
})
