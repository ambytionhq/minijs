// The parts of the picture editors that don't need a screen.
import { compile } from '@minijs/lang'
import { parseSong, parseTilemap, parseTileset, renderSong, stringifyAsset } from '@minijs/runtime'
import { describe, expect, it } from 'vitest'
import { fileKind, mimeType } from '../src/files/paths.js'
import { MemoryFs } from '../src/files/memory-fs.js'
import { usableSrc } from '../src/files/project-assets.js'
import { collectFiles, exportHtml } from '../src/share/export-html.js'
import { encodePack, decodePack, packFiles, packProject } from '../src/share/pack.js'
import { VISUAL_KINDS, newFileText, visualKind } from '../src/tools/index.js'
import { addMachine, addState, addTransition, arrows, changeTransition, insertDeclaration, makeStart, readProgram, readSection, removeState, renameState, writeSection } from '../src/tools/machine-edit.js'
import { composeSong, rowsFor } from '../src/tools/music-tool.js'
import { makeTerrainSheet, starterTilemap, starterTileset } from '../src/tools/starter-tiles.js'
import { assetName } from '../src/tools/ui.js'

const GAME = `thing enemy
  looks like red box 8 by 8

states enemy
  state walk
    on enter
      stop enemy
    always
      move enemy left 1
    go to rest after 2 seconds
    when enemy touches enemy
      stop enemy
  state rest
    go to walk when space key is pressed

when enemy is in rest
  set enemy state to walk
when enemy enters rest
  stop enemy
`

/** @param {string} text */
const clean = (text) => expect(compile(text).errors).toEqual([])

describe('new files', () => {
  it('every kind opens and is valid', () => {
    expect(Object.keys(VISUAL_KINDS).sort()).toEqual(['music', 'particles', 'sound', 'tilemap', 'tileset'])
    expect(parseTileset(newFileText('tileset'))?.tiles.length).toBeGreaterThan(10)
    expect(parseTilemap(newFileText('tilemap', { tileset: 'x.tileset' }))?.tileset).toBe('x.tileset')
    expect(parseSong(newFileText('music'))?.tracks.length).toBe(4)
    expect(JSON.parse(newFileText('sound')).minijs).toBe('sound')
    expect(JSON.parse(newFileText('particles')).minijs).toBe('particles')
  })

  it('knows which files open as pictures', () => {
    expect(visualKind('a/b.tilemap')).toBe('tilemap')
    expect(visualKind('b.SOUND')).toBe('sound')
    expect(visualKind('b.mini')).toBeNull()
    expect(fileKind('b.tileset')).toBe('text')
    expect(fileKind('b.mp3')).toBe('audio')
    expect(mimeType('b.wav')).toBe('audio/wav')
  })

  it('makes names a game can use', () => {
    expect(assetName('Big Boom!.sound')).toBe('big-boom')
    expect(assetName('2-coin.sound')).toBe('coin')
    expect(assetName('map.tilemap')).toBe('my-map')
    expect(assetName('123.sound')).toBe('my-file')
  })
})

describe('starter tiles', () => {
  it('has real pictures, and a survives saving and reading', () => {
    const set = starterTileset()
    const back = /** @type {any} */ (parseTileset(stringifyAsset(set)))
    expect(back.tiles).toEqual(set.tiles)
    for (const tile of set.tiles) {
      expect(tile.frames.some((f) => /[^.]/.test(f)), tile.name).toBe(true)
    }
    expect(new Set(set.tiles.map((t) => t.key)).size).toBe(set.tiles.length)
  })

  it('terrain sheets have their fill, edges and unused corners in the right places', () => {
    const sheet = makeTerrainSheet({ tileW: 4, tileH: 4, fill: () => 'f', edge: () => 'e', top: () => 't', edgeWidth: 1, topWidth: 1 })
    const at = (/** @type {number} */ x, /** @type {number} */ y) => sheet[y * 16 + x]
    expect(sheet.length).toBe(16 * 12)
    expect(at(5, 5)).toBe('f') // the middle square
    expect(at(5, 0)).toBe('t') // top edge
    expect(at(0, 5)).toBe('e') // left edge
    expect(at(5, 11)).toBe('e') // bottom edge
    expect(at(13, 5)).toBe('.') // not used
    expect(at(12, 0)).toBe('t') // inner corner
    expect(at(13, 1)).toBe('f') // the rest of the inner corner tile
  })

  it('a new tile map stands on ground', () => {
    const map = starterTilemap('t.tileset', 4, 3)
    expect(map.layers[0].rows).toEqual(['....', 'gggg', 'gggg'])
  })
})

describe('music', () => {
  it('only offers notes in the scale', () => {
    const song = /** @type {any} */ (parseSong(newFileText('music')))
    const rows = rowsFor(song, song.tracks[0])
    const inScale = new Set([0, 2, 4, 7, 9])
    for (const note of rows) expect(inScale.has((note - song.root + 120) % 12), String(note)).toBe(true)
    expect(rowsFor(song, song.tracks[3])).toEqual([2, 3, 1, 0])
  })

  it('makes up a tune that fits the song and plays', () => {
    const song = /** @type {any} */ (parseSong(newFileText('music')))
    let seed = 1
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const tune = composeSong({ ...song, steps: 64 }, random)
    expect(tune.tracks[0].notes.length).toBeGreaterThan(4)
    expect(tune.tracks.every((t) => t.notes.every(([s]) => s < 64))).toBe(true)
    expect(renderSong(tune, 4000).some((v) => Math.abs(v) > 0.05)).toBe(true)
  })
})

describe('editing states in the text', () => {
  it('finds machines even when the rest of the game has problems', () => {
    const program = readProgram(`${GAME}\nalways\n  jmup\n`)
    expect(program.machines[0].states.map((s) => s.name)).toEqual(['walk', 'rest'])
  })

  it('adds a machine for a thing and for the game, before the rules', () => {
    const next = addMachine('thing a\n  looks like red box 1 by 1\n\nalways\n  stop a\n', 'a')
    expect(next.indexOf('states a')).toBeLessThan(next.indexOf('always'))
    clean(next)
    const game = addMachine('', null)
    expect(game).toBe('states game\n  state start\n')
    clean(game)
  })

  it('adds a state to the right block', () => {
    const next = addState(GAME, 'enemy', 'chase')
    clean(next)
    const m = readProgram(next).machines[0]
    expect(m.states.map((s) => s.name)).toEqual(['walk', 'rest', 'chase'])
  })

  it('adds and changes ways out', () => {
    const next = addTransition(GAME, 'enemy', 'rest', 'after 3 seconds', 'walk')
    clean(next)
    expect(arrows(readProgram(next).machines[0]).map((a) => `${a.from}>${a.to}`)).toEqual(['walk>rest', 'rest>walk', 'rest>walk'])
    const changed = changeTransition(next, 'enemy', 'rest', 1, 'go to walk after 9 seconds')
    clean(changed)
    expect(changed).toContain('    go to walk after 9 seconds')
    const removed = changeTransition(changed, 'enemy', 'rest', 1, null)
    clean(removed)
    expect(removed).not.toContain('after 9 seconds')
  })

  it('renames a state everywhere it is mentioned, and nothing else', () => {
    const next = renameState(`${GAME}thing rest\n  looks like red box 1 by 1\nwhen rest x is above 1\n  stop rest\n`, 'enemy', 'rest', 'nap')
    clean(next)
    expect(next).toContain('state nap')
    expect(next).toContain('go to nap after 2 seconds')
    expect(next).toContain('when enemy is in nap')
    expect(next).toContain('when enemy enters nap')
    expect(next).toContain('thing rest')
    expect(next).toContain('stop rest')
  })

  it('removing a state removes the ways into it', () => {
    const next = removeState(GAME.replace(/when enemy is in rest[\s\S]*/, ''), 'enemy', 'rest')
    clean(next)
    expect(next).not.toContain('go to rest')
    expect(readProgram(next).machines[0].states.map((s) => s.name)).toEqual(['walk'])
  })

  it('can choose which state comes first', () => {
    const next = makeStart(GAME, 'enemy', 'rest')
    clean(next)
    expect(readProgram(next).machines[0].states.map((s) => s.name)).toEqual(['rest', 'walk'])
  })

  it('reads and writes the lines of each section', () => {
    expect(readSection(GAME, 'enemy', 'walk', 'enter')).toEqual(['stop enemy'])
    expect(readSection(GAME, 'enemy', 'walk', 'leave')).toEqual([])
    const added = writeSection(GAME, 'enemy', 'rest', 'enter', ['stop enemy', 'move enemy up 1', ''])
    clean(added)
    expect(readSection(added, 'enemy', 'rest', 'enter')).toEqual(['stop enemy', 'move enemy up 1'])
    const replaced = writeSection(added, 'enemy', 'walk', 'always', ['move enemy right 2'])
    clean(replaced)
    expect(readSection(replaced, 'enemy', 'walk', 'always')).toEqual(['move enemy right 2'])
    const removed = writeSection(replaced, 'enemy', 'walk', 'enter', [])
    clean(removed)
    expect(removed.match(/on enter/g)?.length).toBe(1)
  })
})

describe('adding a line to a game', () => {
  it('goes above the things, joins others like it, and only once', () => {
    const start = 'game\n  size 10 by 10\n\nthing a\n  looks like red box 1 by 1\n'
    const one = insertDeclaration(start, 'sound ding like coin')
    clean(one)
    expect(one.indexOf('sound ding')).toBeLessThan(one.indexOf('thing a'))
    expect(insertDeclaration(one, 'sound ding like coin')).toBe(one)
    const two = insertDeclaration(one, 'sound dong like coin')
    clean(two)
    expect(two).toContain('sound ding like coin\nsound dong like coin')
  })

  it('works on an empty file', () => {
    expect(insertDeclaration('', 'sound a like coin')).toBe('sound a like coin\n')
  })
})

describe('sharing games that use these files', () => {
  const files = {
    'game.mini': 'tilemap m "m.tilemap"\nsound a "a.sound"\nsound b "b.mp3"\nmusic c "c.music"\nparticles d "d.particles"\n',
    'm.tilemap': newFileText('tilemap', { tileset: 't.tileset' }),
    't.tileset': newFileText('tileset'),
    'a.sound': newFileText('sound'),
    'b.mp3': new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
    'c.music': newFileText('music'),
    'd.particles': newFileText('particles'),
    'unused.sound': newFileText('sound'),
  }

  it('share codes carry every file the game uses, and only those', async () => {
    const fs = new MemoryFs('x', files)
    const pack = await packProject(fs, 'game.mini', 'x')
    expect(Object.keys(pack.files).sort()).toEqual(['a.sound', 'b.mp3', 'c.music', 'd.particles', 'game.mini', 'm.tilemap', 't.tileset'])
    expect(pack.files['b.mp3']).toMatch(/^data:/)
    const back = /** @type {any} */ (await decodePack(await encodePack(pack)))
    const out = packFiles(back)
    expect(out['b.mp3']).toBeInstanceOf(Blob)
    expect(typeof out['m.tilemap']).toBe('string')
  })

  it('exported pages carry them too', async () => {
    const fs = new MemoryFs('x', files)
    const { program } = compile(files['game.mini'])
    const found = await collectFiles(fs, 'game.mini', /** @type {any} */ (program))
    expect(Object.keys(found).sort()).toEqual(['a.sound', 'b.mp3', 'c.music', 'd.particles', 'm.tilemap', 't.tileset'])
    const html = exportHtml({ title: 't', program: /** @type {any} */ (program), images: {}, files: found, playerSource: '' })
    expect(html).toContain('files: data.files')
    expect(html).toContain('t.tileset')
  })

  it('finds the shortest name for a file', () => {
    expect(usableSrc('game.mini', 'a.sound')).toBe('a.sound')
    expect(usableSrc('game.mini', 'assets/a.sound')).toBe('a.sound')
    expect(usableSrc('levels/game.mini', 'levels/a.sound')).toBe('a.sound')
  })
})
