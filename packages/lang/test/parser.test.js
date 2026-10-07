import { describe, expect, it } from 'vitest'
import { lex } from '../src/lexer.js'
import { parse } from '../src/parser.js'
import { SPEC_EXAMPLE } from './fixtures.js'
import { strip } from './helpers.js'

/** @param {string} src */
const p = (src) => parse(lex(src).tokens)
/** @param {string} src */
const errs = (src) => p(src).errors.map((e) => [e.code, e.line, e.col])

describe('parser: spec example', () => {
  const { program, errors } = p(SPEC_EXAMPLE)
  it('parses cleanly', () => {
    expect(errors).toEqual([])
  })
  it('reads game settings and variables', () => {
    expect(program.game).toEqual({
      width: 320,
      height: 180,
      pixelArt: true,
      background: 'skyblue',
      gravity: 0.4,
      touchButtons: false,
      loc: { line: 1, col: 1 },
    })
    expect(program.vars).toEqual([{ name: 'score', initial: 0, loc: { line: 7, col: 1 } }])
  })
  it('reads things', () => {
    expect(program.things.map((t) => t.name)).toEqual(['player', 'ground', 'coin'])
    expect(program.things[0]).toMatchObject({
      solid: true,
      falls: true,
      fixed: false,
      cameraFollows: true,
      starts: [{ x: 40, y: 100 }],
    })
    expect(strip(program.things[2].look)).toEqual({ kind: 'circle', color: 'gold', r: 4 })
  })
  it('reads rules', () => {
    expect(program.rules).toHaveLength(7)
    expect(program.rules[6].trigger).toEqual({ kind: 'always', loc: { line: 45, col: 1 } })
    expect(program.rules[3].actions.map((a) => a.kind)).toEqual(['remove', 'addVar'])
  })
})

describe('parser: things', () => {
  it('reads animations, size and several starts', () => {
    const { program, errors } = p(
      'thing hero\n  looks like "hero.png"\n  animation walk "a.png", "b.png" at 8 fps\n  size 16 by 20\n  starts at 1, 2\n  starts at -3, 4\n',
    )
    expect(errors).toEqual([])
    expect(strip(program.things[0])).toEqual({
      name: 'hero',
      look: { kind: 'image', src: 'hero.png' },
      animations: [{ name: 'walk', frames: ['a.png', 'b.png'], fps: 8 }],
      size: { w: 16, h: 20 },
      starts: [
        { x: 1, y: 2 },
        { x: -3, y: 4 },
      ],
      solid: false,
      fixed: false,
      falls: false,
      cameraFollows: false,
    })
  })
  it('reports a missing look but keeps the thing', () => {
    const { program, errors } = p('thing coin\n  solid\n')
    expect(errors).toEqual([
      {
        code: 'missing-look',
        message: 'The thing "coin" needs a look.',
        hint: 'Add a line like: looks like gold circle 4',
        line: 1,
        col: 1,
      },
    ])
    expect(strip(program.things[0].look)).toEqual({ kind: 'box', color: 'white', w: 10, h: 10 })
    expect(p('thing coin\n').errors.map((e) => e.code)).toEqual(['missing-look'])
  })
  it('does not also report a missing look when the look line is broken', () => {
    expect(p('thing coin\n  looks like blu circle 4\n').errors.map((e) => e.code)).toEqual(['unknown-color'])
  })
  it('reports a second look', () => {
    const { program, errors } = p('thing coin\n  looks like gold circle 4\n  looks like red box 2 by 2\n')
    expect(errors).toEqual([
      {
        code: 'duplicate-look',
        message: 'The thing "coin" has more than one "looks like" line.',
        hint: 'Keep one. To change its look during the game, use: change coin to look like ...',
        line: 3,
        col: 3,
      },
    ])
    expect(program.things[0].look).toMatchObject({ kind: 'circle' })
  })
  it('reports unknown thing lines with a suggestion', () => {
    expect(p('thing a\n  looks like red box 1 by 1\n  soild\n').errors).toEqual([
      {
        code: 'unknown-word',
        message: 'I don\'t know what "soild" means here.',
        hint: 'Did you mean "solid"?',
        line: 3,
        col: 3,
      },
    ])
  })
  it('reports reserved names', () => {
    expect(p('thing left\n  looks like red box 1 by 1\n').errors).toEqual([
      {
        code: 'name-clash',
        message: '"left" is a special word in minijs, so it can\'t be a name.',
        hint: 'Pick another name, like left-wall.',
        line: 1,
        col: 7,
      },
    ])
    expect(errs('x starts at 0')).toEqual([['name-clash', 1, 1]])
  })
})

describe('parser: game block', () => {
  it('reports a second game block', () => {
    expect(p('game\n  pixel art\ngame\n  gravity 1\n').errors).toEqual([
      {
        code: 'duplicate-game',
        message: 'There is more than one "game" block.',
        hint: 'Put all game settings in one block.',
        line: 3,
        col: 1,
      },
    ])
  })
  it('keeps the first game block', () => {
    expect(p('game\n  gravity 2\ngame\n  gravity 1\n').program.game.gravity).toBe(2)
  })
  it('rejects negative gravity', () => {
    expect(errs('game\n  gravity -1\n')).toEqual([['bad-number', 2, 11]])
  })
  it('reports unknown settings', () => {
    expect(p('game\n  sise 1 by 2\n').errors[0]).toMatchObject({ code: 'unknown-word', hint: 'Did you mean "size"?' })
  })
})

describe('parser: rules and recovery', () => {
  it('requires actions under a rule', () => {
    expect(p('when game starts\nscore starts at 0\n')).toMatchObject({
      errors: [
        {
          code: 'expected',
          message: 'I expected some actions under this line.',
          hint: 'Put the actions on the next lines, indented.',
          line: 1,
          col: 1,
        },
      ],
      program: { vars: [{ name: 'score' }], rules: [] },
    })
  })
  it('reports unknown top-level words', () => {
    expect(p('thng player\n  solid\n').errors).toEqual([
      {
        code: 'unknown-word',
        message: 'I don\'t know what "thng" means here.',
        hint: 'Did you mean "thing"?',
        line: 1,
        col: 1,
      },
    ])
    expect(p('banana split\n').errors[0].hint).toBe(
      'Lines at the left edge start with game, thing, control, when, always, or a name followed by "starts at".',
    )
  })
  it('reports extra words at the end of a line', () => {
    expect(p('always\n  stop game now\n').errors[0]).toMatchObject({
      code: 'expected',
      message: 'I expected the end of the line here, but found "now".',
      line: 2,
      col: 13,
    })
  })
  it('reports nested indentation', () => {
    expect(errs('always\n  stop game\n    stop game\n')).toEqual([['indent-unexpected', 3, 5]])
    expect(errs('  always\n')).toEqual([['indent-unexpected', 1, 3]])
  })
  it('reports one error per broken line and keeps the good rules', () => {
    const src = [
      'thing coin',
      '  looks like gold circle 4',
      '  bouncy',
      'when coin touches coin',
      '  remove the coin',
      '  jmup coin',
      'when banana key is pressed',
      '  remove coin',
      '  remove coin',
      'always',
      '  remove coin',
    ].join('\n')
    const { program, errors } = p(src)
    expect(errors.map((e) => [e.code, e.line])).toEqual([
      ['unknown-word', 3],
      ['unknown-word', 6],
      ['unknown-key', 7],
    ])
    expect(program.rules.map((r) => r.trigger.kind)).toEqual(['touch', 'always'])
    expect(program.rules[0].actions).toHaveLength(1)
  })
})
