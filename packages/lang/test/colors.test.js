import { describe, expect, it } from 'vitest'
import { CSS_COLOR_NAMES, isCssColor, normalizeColor } from '../src/colors.js'

describe('colors', () => {
  it('knows all 148 CSS named colors', () => {
    expect(CSS_COLOR_NAMES).toHaveLength(148)
    expect(new Set(CSS_COLOR_NAMES).size).toBe(148)
    expect(isCssColor('rebeccapurple')).toBe(true)
  })
  it('accepts hex colors', () => {
    expect(isCssColor('#fff')).toBe(true)
    expect(isCssColor('#1A2b3C')).toBe(true)
    expect(isCssColor('#12345')).toBe(false)
  })
  it('joins multi-word names', () => {
    expect(normalizeColor(['sky', 'blue'])).toBe('skyblue')
    expect(normalizeColor(['Dark', 'Slate', 'Gray'])).toBe('darkslategray')
    expect(normalizeColor(['#FF8800'])).toBe('#ff8800')
    expect(normalizeColor(['blu'])).toBeNull()
    expect(normalizeColor([])).toBeNull()
  })
})
