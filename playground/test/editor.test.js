import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { toDiagnostic } from '../src/editor.js'

/** @param {string[]} lines */
const doc = (lines) => Text.of(lines)
const error = (line, col, message, hint = null) => ({ code: 'expected', line, col, message, hint })

describe('toDiagnostic', () => {
  const d = doc(['when player touches coin', '  remove the cion', '  add 1 to scroe'])

  it('underlines the bad name, not the start of the action', () => {
    const diag = toDiagnostic(d, error(2, 3, 'I don\'t know what "cion" is.', 'Did you mean "coin"?'))
    expect(d.sliceString(diag.from, diag.to)).toBe('cion')
    expect(diag.message).toBe('I don\'t know what "cion" is. Did you mean "coin"?')
    expect(diag.severity).toBe('error')
  })

  it('underlines one word when there is no quoted name', () => {
    const diag = toDiagnostic(d, error(3, 9, 'I expected a number here, but found the end of the line.'))
    expect(d.sliceString(diag.from, diag.to)).toBe('to')
  })

  it('underlines the whole line for indentation problems', () => {
    const diag = toDiagnostic(d, error(2, 1, 'This line is indented by an odd amount.'))
    expect(d.sliceString(diag.from, diag.to)).toBe('  remove the cion')
  })

  it('stays inside the document for out-of-range positions', () => {
    const diag = toDiagnostic(d, error(99, 99, 'x'))
    expect(diag.from).toBeLessThanOrEqual(d.length)
    expect(diag.to).toBeLessThanOrEqual(d.length)
  })
})
