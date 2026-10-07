import { describe, expect, it } from 'vitest'
import { MemoryFs } from '../src/files/memory-fs.js'
import { decodePack, encodePack, extractCode, packFiles, packProject, shareLink } from '../src/share/pack.js'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

function project() {
  return new MemoryFs('p', {
    'games/hero.mini': 'thing hero\n  looks like "hero.png"\n  starts at 1, 1\n',
    'games/assets/hero.png': new Blob([PNG], { type: 'image/png' }),
    'games/assets/unused.png': new Blob([PNG], { type: 'image/png' }),
    'notes.txt': 'not shared',
  })
}

describe('share codes', () => {
  it('packs the game and only the pictures it uses', async () => {
    const pack = await packProject(project(), 'games/hero.mini', 'Hero')
    expect(Object.keys(pack.files).sort()).toEqual(['games/assets/hero.png', 'games/hero.mini'])
    expect(pack.files['games/assets/hero.png']).toMatch(/^data:image\/png;base64,/)
  })

  it('round-trips through a code and a link', async () => {
    const pack = await packProject(project(), 'games/hero.mini', 'Hero')
    const code = await encodePack(pack)
    expect(code).toMatch(/^m1[A-Za-z0-9_-]+$/)
    expect(await decodePack(code)).toEqual(pack)
    const link = shareLink(code, 'play', 'https://minijs.example/studio/')
    expect(link).toBe(`https://minijs.example/studio/#/play/${code}`)
    expect(await decodePack(link)).toEqual(pack)
    expect(await decodePack(`  ${link.replace('#/play/', '#/open/')}\n`)).toEqual(pack)
    const files = packFiles(pack)
    expect(files['games/hero.mini']).toBe(pack.files['games/hero.mini'])
    const blob = /** @type {Blob} */ (files['games/assets/hero.png'])
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PNG)
  })

  it('rejects broken, cut-off and unsafe codes', async () => {
    const code = await encodePack({ v: 1, name: 'x', main: 'a.mini', files: { 'a.mini': 'game' } })
    expect(await decodePack(code.slice(0, code.length - 6))).toBeNull()
    expect(await decodePack('hello')).toBeNull()
    expect(await decodePack('m1!!!')).toBeNull()
    const unsafe = await encodePack({ v: 1, name: 'x', main: 'a.mini', files: { 'a.mini': 'g', '../evil': 'x' } })
    expect(await decodePack(unsafe)).toBeNull()
    const noMain = await encodePack({ v: 1, name: 'x', main: 'a.mini', files: { 'b.mini': 'g' } })
    expect(await decodePack(noMain)).toBeNull()
  })

  it('finds codes in pasted text', () => {
    expect(extractCode('see https://x.y/#/play/m1abc_-Z')).toBe('m1abc_-Z')
    expect(extractCode('m1abc')).toBe('m1abc')
    expect(extractCode('nothing here')).toBeNull()
    expect(extractCode('here is my game: m1abcdefghijklmnopqrstuv, have fun')).toBe('m1abcdefghijklmnopqrstuv')
    expect(extractCode('my name is m1ke')).toBeNull()
  })
})
