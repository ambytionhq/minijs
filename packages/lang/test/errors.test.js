// Error wording is product surface: no jargon in any message or hint.
import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'

const BROKEN = [
  'thing a\n  solid\n\tfixed',
  'thing a\n  solid\n   fixed',
  'thing a\n  solid\n      fixed',
  'always\n  show text "oops',
  'game\n  size 10px by 4',
  'always\n  add 1 @ score',
  'jmup',
  'always\n  jmup',
  'when jump key is pressed\n  stop game',
  'thing a\n  looks like blu box 1 by 1',
  'always\n  remove cion',
  'always\n  add 1 to scroe',
  'thing a\n  looks like "a.png"\nalways\n  play x on a',
  'thing a\n  looks like "a.png"\nalways\n  play spin on a',
  'thing a\n  looks like "a.png"\nthing a\n  looks like "a.png"',
  'n starts at 1\nn starts at 2',
  'thing left\n  looks like "a.png"',
  'thing a\n  solid',
  'thing a\n  looks like "a.png"\n  looks like "a.png"',
  'game\ngame',
  'when score is\n  stop game',
  'always\n  show text "{score"',
  'always\n  move a sideways 2',
  'when every 0 seconds\n  stop game',
  'thing a\n  looks like "a.png"\n  camera follows\nthing b\n  looks like "a.png"\n  camera follows',
  'when game starts',
]

describe('error wording', () => {
  it('never uses jargon', () => {
    const banned = /\b(token|identifier|expression|syntax)s?\b/i
    let count = 0
    for (const src of BROKEN) {
      const { errors } = compile(src)
      expect(errors.length, src).toBeGreaterThan(0)
      for (const e of errors) {
        count++
        expect(e.message, src).not.toMatch(banned)
        if (e.hint) expect(e.hint, src).not.toMatch(banned)
        expect(e.line).toBeGreaterThanOrEqual(1)
        expect(e.col).toBeGreaterThanOrEqual(1)
      }
    }
    expect(count).toBeGreaterThanOrEqual(BROKEN.length)
  })

  it('covers every language error code', () => {
    const codes = new Set(BROKEN.flatMap((src) => compile(src).errors.map((e) => e.code)))
    for (const code of [
      'indent-mixed',
      'indent-uneven',
      'indent-unexpected',
      'unknown-word',
      'expected',
      'unterminated-string',
      'bad-number',
      'unknown-thing',
      'unknown-variable',
      'unknown-animation',
      'unknown-key',
      'unknown-color',
      'duplicate-thing',
      'duplicate-variable',
      'name-clash',
      'missing-look',
      'duplicate-look',
      'multiple-cameras',
      'duplicate-game',
    ]) {
      expect(codes, code).toContain(code)
    }
  })
})
