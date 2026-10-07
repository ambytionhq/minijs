import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'
import { SPEC_EXAMPLE } from './fixtures.js'

describe('compile', () => {
  it('compiles the spec example cleanly', () => {
    const r = compile(SPEC_EXAMPLE)
    expect(r.errors).toEqual([])
    expect(r.program).not.toBeNull()
    // Golden AST, reviewed by hand. Equality with the runtime's hand-built
    // specExample is asserted in packages/runtime/test/integration.test.js.
    expect(r.program).toMatchSnapshot()
  })

  it('returns a null program with sorted errors', () => {
    const r = compile('thing coin\n  looks like gold circle 4\nwhen player touches cion\n  remove cion\n  add 1 to scroe\n')
    expect(r.program).toBeNull()
    expect(r.errors.map((e) => [e.code, e.line])).toEqual([
      ['unknown-thing', 3],
      ['unknown-thing', 3],
      ['unknown-thing', 4],
      ['unknown-variable', 5],
    ])
  })

  it('reports lexer and parser errors together, in order, and skips name checks', () => {
    const r = compile('always\n  remove cion\n  add 1 @ score\nthng x\n')
    expect(r.program).toBeNull()
    expect(r.errors.map((e) => [e.code, e.line, e.col])).toEqual([
      ['unknown-word', 3, 9],
      ['unknown-word', 4, 1],
    ])
  })

  it('caps errors at 50', () => {
    expect(compile('jmup\n'.repeat(80)).errors).toHaveLength(50)
  })

  it('never throws on garbage', () => {
    for (const src of [
      '',
      '\n\n',
      '"',
      '{',
      'when',
      'thing',
      '   x',
      '\t\t\t',
      'when when when',
      'show text "{"',
      'always\n  show text "{"',
      'always\n  show text "{}"',
      'always\n  show text "{1 2}"',
      'always\n  show text "{@}"',
      'thing\n  looks like',
      'game\n  background',
      'when 1 key\n',
      'when - - -\n  stop',
      ',,,,',
      'always\n\tstop game\n  stop game',
    ]) {
      expect(() => compile(src)).not.toThrow()
      const r = compile(src)
      expect(r.program === null).toBe(r.errors.length > 0)
    }
  })

  it('compiles an empty file to defaults', () => {
    expect(compile('').program).toEqual({
      game: { width: 480, height: 270, pixelArt: false, background: 'black', gravity: 0, touchButtons: false, loc: null },
      vars: [],
      things: [],
      controls: [],
      rules: [],
    })
  })
})
