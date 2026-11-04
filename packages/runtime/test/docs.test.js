// Every game sample in the feature guides must be correct. A sample may leave out
// things it doesn't care about, so names it doesn't declare get filled in, the way
// a reader would have them in their own game.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'

const DOCS = join(import.meta.dirname, '../../../docs')
const GUIDES = ['tilemaps.md', 'particles.md', 'sound.md', 'state-machines.md', 'recipes.md', 'README.md']

/** @param {string} text */
function samples(text) {
  return [...text.matchAll(/```mini\r?\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\r/g, '').replace(/^ {3}/gm, (s) => s))
}

/**
 * Compile, adding whatever undeclared names the errors ask for.
 * @param {string} source
 */
function compileWithStubs(source) {
  let text = source
  for (let tries = 0; tries < 12; tries++) {
    const { errors } = compile(text)
    if (errors.length === 0) return []
    const first = errors[0]
    const name = /"([^"]+)"/.exec(first.message)?.[1]
    if (first.code === 'unknown-thing' && name) text = `thing ${name}\n  looks like red box 4 by 4\n${text}`
    else if (first.code === 'unknown-variable' && name) text = `${name} starts at 0\n${text}`
    else if (first.code === 'unknown-sound' && name) text = `sound ${name} like coin\n${text}`
    else if (first.code === 'unknown-music' && name) text = `music ${name} "x.music"\n${text}`
    else if (first.code === 'unknown-particles' && name) text = `particles ${name} like sparkle\n${text}`
    else if (first.code === 'unknown-control' && name) text = `control ${name}\n  space key\n${text}`
    else if (first.code === 'unknown-animation' && name) {
      const owner = /"([^"]+)" has no animation/.exec(first.message)?.[1]
      const match = /called "([^"]+)"/.exec(first.message)?.[1]
      text = text.replace(new RegExp(`thing ${owner}\\n`), `thing ${owner}\n  animation ${match} "a.png" at 4 fps\n`)
    } else return errors
  }
  return compile(text).errors
}

describe('sample extraction', () => {
  it('finds fenced mini blocks in CRLF markdown', () => {
    const text = '# Title\r\n\r\n```mini\r\nplayer starts at 0\r\nwhen space\r\n  player is 1\r\n```\r\n'
    expect(samples(text)).toEqual(['player starts at 0\nwhen space\n  player is 1\n'])
    expect(samples(text.replace(/\r\n/g, '\n'))).toEqual(samples(text))
  })
})

describe('samples in the guides', () => {
  for (const guide of GUIDES) {
    const text = readFileSync(join(DOCS, guide), 'utf8')
    samples(text).forEach((sample, i) => {
      // recipes.md has older fragments; only whole-file samples are checked there.
      const fragment = /^(\s|when |always)/.test(sample) && guide === 'recipes.md'
      it.skipIf(fragment)(`${guide} sample ${i + 1}`, () => {
        // Numbered lists indent their samples.
        const clean = sample.replace(/^ {3}(?=\S)/gm, '')
        expect(compileWithStubs(clean)).toEqual([])
      })
    })
  }
})

describe('links in the guides', () => {
  /** @param {string} text */
  const anchors = (text) =>
    new Set(
      [...text.matchAll(/^#{1,4} (.+)$/gm)].map((m) =>
        m[1].toLowerCase().replace(/[^\w\- ]/g, '').trim().replace(/ /g, '-'),
      ),
    )

  for (const guide of ['tilemaps.md', 'particles.md', 'sound.md', 'state-machines.md']) {
    it(`${guide} links go somewhere`, () => {
      const text = readFileSync(join(DOCS, guide), 'utf8')
      for (const [, link] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (link.startsWith('http')) continue
        const [file, hash] = link.split('#')
        const target = file === '' ? text : readFileSync(join(DOCS, file))
        if (hash && file.endsWith('.md') || (hash && file === '')) {
          expect(anchors(target.toString()), link).toContain(hash)
        }
      }
    })
  }

  it('uses no long dashes', () => {
    for (const guide of ['tilemaps.md', 'particles.md', 'sound.md', 'state-machines.md']) {
      expect(readFileSync(join(DOCS, guide), 'utf8'), guide).not.toMatch(/[–—]/)
    }
  })
})
