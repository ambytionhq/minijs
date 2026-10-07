// Light syntax coloring for .mini text. Purely cosmetic: compile() is the real reader.

import { StreamLanguage } from '@codemirror/language'

const KEYWORDS = new Set(
  (
    'game thing when always starts at looks like animation fps size by solid fixed falls camera follows ' +
    'pixel art background gravity key is pressed held released mouse clicked on touches leaves screen ' +
    'every after second seconds and or not above below more less greater bigger smaller than ground ' +
    'move push stop set to add subtract from make remove change look play show text in restart random count of ' +
    'box circle left right up down'
  ).split(' '),
)

export const miniLanguage = StreamLanguage.define({
  name: 'mini',
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?=\s|$)/)) return 'string'
    if (stream.peek() === '#') {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.peek() === '"') {
      stream.next()
      let escaped = false
      while (!stream.eol()) {
        const ch = stream.next()
        if (ch === '"' && !escaped) break
        escaped = ch === '\\' && !escaped
      }
      return 'string'
    }
    if (stream.match(/^\d+(?:\.\d+)?/)) return 'number'
    const word = stream.match(/^[A-Za-z][A-Za-z0-9_-]*/)
    if (word) return KEYWORDS.has(/** @type {RegExpMatchArray} */ (word)[0].toLowerCase()) ? 'keyword' : null
    stream.next()
    return null
  },
})
