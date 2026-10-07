import { describe, expect, it } from 'vitest'
import { lex } from '../src/lexer.js'

/** @param {string} src */
const kinds = (src) =>
  lex(src).tokens.map((t) =>
    t.kind === 'word' || t.kind === 'op' || t.kind === 'color' ? t.text : t.kind === 'number' ? t.value : t.kind,
  )

describe('lexer', () => {
  it('lexes words, numbers, commas and ops on one line', () => {
    expect(kinds('starts at 40, -100')).toEqual(['starts', 'at', 40, 'comma', '-', 100, 'newline', 'eof'])
  })
  it('lexes decimals', () => {
    expect(kinds('gravity 0.4')).toEqual(['gravity', 0.4, 'newline', 'eof'])
  })
  it('lowercases words and keeps hyphens in names', () => {
    expect(kinds('Thing Big-Rock')).toEqual(['thing', 'big-rock', 'newline', 'eof'])
  })
  it('emits indent and dedent from the first indent unit', () => {
    expect(kinds('thing a\n    solid\n    fixed\nalways\n    stop game')).toEqual([
      'thing', 'a', 'newline', 'indent', 'solid', 'newline', 'fixed', 'newline', 'dedent',
      'always', 'newline', 'indent', 'stop', 'game', 'newline', 'dedent', 'eof',
    ])
  })
  it('closes several levels at once', () => {
    expect(kinds('a\n\tb\n\t\tc\nd')).toEqual([
      'a', 'newline', 'indent', 'b', 'newline', 'indent', 'c', 'newline', 'dedent', 'dedent', 'd', 'newline', 'eof',
    ])
  })
  it('ignores blank and comment-only lines, including their indentation', () => {
    expect(kinds('thing a\n\n      # note\n  solid  # trailing\n')).toEqual([
      'thing', 'a', 'newline', 'indent', 'solid', 'newline', 'dedent', 'eof',
    ])
  })
  it('handles windows line endings', () => {
    expect(kinds('a\r\n  b\r\n')).toEqual(['a', 'newline', 'indent', 'b', 'newline', 'dedent', 'eof'])
  })
  it('lexes hex colors but treats other # as comments', () => {
    expect(kinds('background #1a2B3c')).toEqual(['background', '#1a2b3c', 'newline', 'eof'])
    expect(kinds('background red #ff is nice')).toEqual(['background', 'red', 'newline', 'eof'])
    expect(kinds('background #abcd')).toEqual(['background', 'newline', 'eof'])
  })
  it('lexes strings with escapes and positions', () => {
    const { tokens } = lex('show text "Say \\"hi\\""')
    expect(tokens[2]).toEqual({ kind: 'string', text: 'Say "hi"', value: 0, loc: { line: 1, col: 11 } })
  })
  it('keeps # inside strings', () => {
    expect(lex('show text "#1 fan"').tokens[2].text).toBe('#1 fan')
  })
  it('lexes ops', () => {
    expect(kinds('a + b * 2 / 3 - c')).toEqual(['a', '+', 'b', '*', 2, '/', 3, '-', 'c', 'newline', 'eof'])
  })
  it('tracks 1-based line and column', () => {
    const { tokens } = lex('a\n  b')
    expect(tokens.map((t) => [t.kind, t.loc.line, t.loc.col])).toEqual([
      ['word', 1, 1], ['newline', 1, 2], ['indent', 2, 3], ['word', 2, 3], ['newline', 2, 4], ['dedent', 2, 4], ['eof', 2, 4],
    ])
  })
  it('lexes an empty file to just eof', () => {
    expect(lex('').tokens).toEqual([{ kind: 'eof', text: '', value: 0, loc: { line: 1, col: 1 } }])
  })
})

describe('lexer errors', () => {
  /** @param {string} src */
  const errs = (src) => lex(src).errors.map((e) => [e.code, e.line, e.col])
  it('reports mixed indentation', () => {
    expect(errs('thing a\n  solid\n\tfixed')).toEqual([['indent-mixed', 3, 1]])
    expect(errs('thing a\n \tsolid')).toEqual([['indent-mixed', 2, 1]])
  })
  it('reports uneven indentation with the unit in the hint', () => {
    expect(errs('thing a\n  solid\n   fixed')).toEqual([['indent-uneven', 3, 1]])
    expect(lex('thing a\n  solid\n   fixed').errors[0]).toMatchObject({
      message: 'This line is indented by an odd amount.',
      hint: 'Indent each level by 2 spaces, like the lines above.',
    })
  })
  it('reports jumps of more than one level', () => {
    expect(errs('thing a\n  solid\n      fixed')).toEqual([['indent-unexpected', 3, 1]])
  })
  it('skips bad lines without changing depth', () => {
    expect(kinds('a\n  b\n   c\n  d')).toEqual(['a', 'newline', 'indent', 'b', 'newline', 'd', 'newline', 'dedent', 'eof'])
  })
  it('reports unterminated strings and still emits the text', () => {
    expect(errs('show text "oops')).toEqual([['unterminated-string', 1, 11]])
    const { tokens, errors } = lex('show text "oops')
    expect(tokens[2]).toMatchObject({ kind: 'string', text: 'oops' })
    expect(errors[0]).toMatchObject({
      message: 'This text is missing its closing quote (").',
      hint: 'Add a " at the end of the text.',
    })
  })
  it('reports numbers glued to letters', () => {
    expect(errs('size 10px by 4')).toEqual([['bad-number', 1, 6]])
    expect(lex('size 10px by 4').errors[0]).toMatchObject({
      message: 'I expected a number but found "10px".',
      hint: 'Write just the number, like 10.',
    })
    expect(kinds('size 10px by 4')).toEqual(['size', 'by', 4, 'newline', 'eof'])
  })
  it('reports unknown symbols', () => {
    expect(lex('add 1 @ score').errors[0]).toEqual({
      code: 'unknown-word',
      message: 'I don\'t understand the symbol "@".',
      hint: null,
      line: 1,
      col: 7,
    })
  })
})
