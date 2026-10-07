import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.js'
import { strip } from './helpers.js'

const THINGS = 'thing wall\n  looks like gray box 16 by 16\nthing coin\n  looks like gold circle 4\n'

describe('maps', () => {
  it('reads rows, letters, tile size and position', () => {
    const src = THINGS + 'map\n  tiles 8 by 10\n  at 4, -2\n  "#c.#"\n  "#  #"\n  "#" is wall\n  "c" is a coin\n'
    const { program, errors } = compile(src)
    expect(errors).toEqual([])
    expect(strip(program?.maps)).toEqual([
      {
        x: 4,
        y: -2,
        tileW: 8,
        tileH: 10,
        rows: [{ text: '#c.#' }, { text: '#  #' }],
        legend: [
          { char: '#', thing: 'wall' },
          { char: 'c', thing: 'coin' },
        ],
      },
    ])
  })

  it('defaults to 16 by 16 tiles at 0, 0', () => {
    const { program } = compile(THINGS + 'map\n  "#"\n  "#" is wall\n')
    expect(program?.maps[0]).toMatchObject({ x: 0, y: 0, tileW: 16, tileH: 16 })
  })

  it('points at unknown letters inside the row', () => {
    expect(compile(THINGS + 'map\n  "#..x#"\n  "#" is wall\n').errors).toEqual([
      {
        code: 'map-letter',
        message: 'I don\'t know what "x" means in this map.',
        hint: 'Add a line under the rows like: "x" is wall. Use "." for empty tiles.',
        line: 6,
        col: 7,
      },
    ])
  })

  it('reports each unknown letter once', () => {
    expect(compile(THINGS + 'map\n  "zz"\n  "zz"\n').errors.map((e) => e.code)).toEqual(['map-letter'])
  })

  it('checks letters and things', () => {
    expect(compile(THINGS + 'map\n  "#"\n  "#" is wal\n').errors[0]).toMatchObject({
      code: 'unknown-thing',
      hint: 'Did you mean "wall"?',
    })
    expect(compile(THINGS + 'map\n  "#"\n  "##" is wall\n').errors[0]).toMatchObject({
      code: 'map-letter',
      message: 'A map letter must be exactly one character.',
    })
    expect(compile(THINGS + 'map\n  "#"\n  "." is wall\n').errors[0]).toMatchObject({
      message: '"." always means an empty tile.',
    })
    expect(compile(THINGS + 'map\n  "#"\n  "#" is wall\n  "#" is coin\n').errors[0]).toMatchObject({
      code: 'map-letter',
      message: '"#" is given two meanings in this map.',
    })
  })

  it('needs rows', () => {
    expect(compile('map\n').errors[0]).toMatchObject({
      code: 'expected',
      message: 'I expected the rows of the map under this line.',
    })
    expect(compile(THINGS + 'map\n  "#" is wall\n').errors[0]).toMatchObject({ code: 'expected' })
  })

  it('keeps # inside rows (not a note)', () => {
    expect(compile(THINGS + 'map\n  "# # #"\n  "#" is wall\n').program?.maps[0].rows[0].text).toBe('# # #')
  })
})

describe('camera limits', () => {
  it('reads the area', () => {
    expect(compile('game\n  camera stays inside 0, -10 to 640, 360\n').program?.game.cameraBounds).toEqual({ x1: 0, y1: -10, x2: 640, y2: 360 })
    expect(compile('').program?.game.cameraBounds).toBeNull()
  })
  it('rejects a backwards area', () => {
    expect(compile('game\n  camera stays inside 10, 10 to 5, 50\n').errors[0]).toMatchObject({
      code: 'bad-number',
      message: 'The second corner must be right of and below the first.',
    })
  })
})
