// Canonical key names. The language accepts these words before `key`;
// the runtime maps browser KeyboardEvent.code values onto them.

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')
const DIGITS = '0123456789'.split('')

export const KEY_NAMES = [
  'left',
  'right',
  'up',
  'down',
  'space',
  'enter',
  'shift',
  'escape',
  ...LETTERS,
  ...DIGITS,
] as const

export type KeyName = (typeof KEY_NAMES)[number]

const KEY_SET: ReadonlySet<string> = new Set(KEY_NAMES)

export function isKeyName(word: string): word is KeyName {
  return KEY_SET.has(word)
}

/** Map a KeyboardEvent.code to a KeyName, or null if minijs does not use that key. */
export function keyNameFromCode(code: string): KeyName | null {
  switch (code) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'Space':
      return 'space'
    case 'Enter':
    case 'NumpadEnter':
      return 'enter'
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'shift'
    case 'Escape':
      return 'escape'
  }
  if (code.length === 4 && code.startsWith('Key')) {
    const letter = code[3]!.toLowerCase()
    return isKeyName(letter) ? letter : null
  }
  if (code.length === 6 && code.startsWith('Digit')) {
    const digit = code[5]!
    return isKeyName(digit) ? digit : null
  }
  return null
}
