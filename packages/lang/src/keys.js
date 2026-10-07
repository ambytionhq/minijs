// Canonical key names. The language accepts these words before `key`;
// the runtime maps browser KeyboardEvent.code values onto them.

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')
const DIGITS = '0123456789'.split('')

/** @type {readonly KeyName[]} */
export const KEY_NAMES = ['left', 'right', 'up', 'down', 'space', 'enter', 'shift', 'escape', ...LETTERS, ...DIGITS]

/** @typedef {'a'|'b'|'c'|'d'|'e'|'f'|'g'|'h'|'i'|'j'|'k'|'l'|'m'|'n'|'o'|'p'|'q'|'r'|'s'|'t'|'u'|'v'|'w'|'x'|'y'|'z'} Letter */
/** @typedef {'0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'} Digit */
/** @typedef {'left'|'right'|'up'|'down'|'space'|'enter'|'shift'|'escape'|Letter|Digit} KeyName */

/** @type {ReadonlySet<string>} */
const KEY_SET = new Set(KEY_NAMES)

/**
 * @param {string} word
 * @returns {word is KeyName}
 */
export function isKeyName(word) {
  return KEY_SET.has(word)
}

/**
 * Map a KeyboardEvent.code to a KeyName, or null if minijs does not use that key.
 * @param {string} code
 * @returns {KeyName | null}
 */
export function keyNameFromCode(code) {
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
    const letter = code[3].toLowerCase()
    return isKeyName(letter) ? letter : null
  }
  if (code.length === 6 && code.startsWith('Digit')) {
    const digit = code[5]
    return isKeyName(digit) ? digit : null
  }
  return null
}
