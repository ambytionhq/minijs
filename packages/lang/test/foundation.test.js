import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GAME_SETTINGS,
  didYouMean,
  editDistance,
  formatError,
  isKeyName,
  isPadButton,
  keyNameFromCode,
  PAD_BUTTONS,
  miniError,
  suggest,
} from '../src/index.js'

describe('editDistance', () => {
  it('measures single edits', () => {
    expect(editDistance('coin', 'coin')).toBe(0)
    expect(editDistance('cion', 'coin')).toBe(2)
    expect(editDistance('coins', 'coin')).toBe(1)
    expect(editDistance('', 'abc')).toBe(3)
  })
})

describe('suggest', () => {
  it('returns closest candidate within distance 2', () => {
    expect(suggest('cion', ['player', 'coin', 'wall'])).toBe('coin')
    expect(suggest('playr', ['player', 'coin'])).toBe('player')
  })
  it('returns null when nothing is close', () => {
    expect(suggest('banana', ['player', 'coin'])).toBeNull()
  })
  it('breaks ties by first candidate', () => {
    expect(suggest('cat', ['bat', 'hat'])).toBe('bat')
  })
})

describe('didYouMean', () => {
  it('formats a hint', () => {
    expect(didYouMean('cion', ['coin'])).toBe('Did you mean "coin"?')
    expect(didYouMean('zzzzzz', ['coin'])).toBeNull()
  })
})

describe('miniError / formatError', () => {
  it('builds and formats errors', () => {
    const error = miniError(
      'unknown-thing',
      { line: 3, col: 7 },
      'I don\'t know what "cion" is.',
      'Did you mean "coin"?',
    )
    expect(error).toEqual({
      code: 'unknown-thing',
      message: 'I don\'t know what "cion" is.',
      hint: 'Did you mean "coin"?',
      line: 3,
      col: 7,
    })
    expect(formatError(error)).toBe('line 3, column 7: I don\'t know what "cion" is. Did you mean "coin"?')
    expect(formatError({ ...error, hint: null })).toBe('line 3, column 7: I don\'t know what "cion" is.')
  })
})

describe('keys', () => {
  it('recognizes key names', () => {
    expect(isKeyName('left')).toBe(true)
    expect(isKeyName('q')).toBe(true)
    expect(isKeyName('7')).toBe(true)
    expect(isKeyName('ctrl')).toBe(true)
    expect(isKeyName('meta')).toBe(false)
    expect(isKeyName('any')).toBe(false)
  })
  it('maps KeyboardEvent.code values', () => {
    expect(keyNameFromCode('ArrowLeft')).toBe('left')
    expect(keyNameFromCode('Space')).toBe('space')
    expect(keyNameFromCode('KeyW')).toBe('w')
    expect(keyNameFromCode('Digit3')).toBe('3')
    expect(keyNameFromCode('ShiftRight')).toBe('shift')
    expect(keyNameFromCode('ControlLeft')).toBe('ctrl')
    expect(keyNameFromCode('AltRight')).toBe('alt')
    expect(keyNameFromCode('Tab')).toBe('tab')
    expect(keyNameFromCode('Backspace')).toBe('backspace')
    expect(keyNameFromCode('Delete')).toBe('delete')
    expect(keyNameFromCode('Numpad5')).toBe('5')
    expect(keyNameFromCode('MetaLeft')).toBeNull()
    expect(keyNameFromCode('F5')).toBeNull()
  })
  it('lists gamepad buttons in standard layout order', () => {
    expect(PAD_BUTTONS.slice(0, 4)).toEqual(['a', 'b', 'x', 'y'])
    expect(PAD_BUTTONS.indexOf('start')).toBe(9)
    expect(PAD_BUTTONS.indexOf('up')).toBe(12)
    expect(isPadButton('lt')).toBe(true)
    expect(isPadButton('jump')).toBe(false)
  })
})

describe('defaults', () => {
  it('has spec default game settings', () => {
    expect(DEFAULT_GAME_SETTINGS).toEqual({
      width: 480,
      height: 270,
      pixelArt: false,
      background: 'black',
      gravity: 0,
      touchButtons: false,
      cameraBounds: null,
    })
  })
})
