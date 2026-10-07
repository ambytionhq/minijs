// Every examples/**/*.mini compiles with zero problems and runs headless without runtime errors.
// Picture sizes come from the real PNG files in the game's assets folder.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'
import { StaticAssetLoader } from '../src/assets.js'
import { ManualInput } from '../src/input.js'
import { Simulation } from '../src/simulation.js'

const root = join(import.meta.dirname, '../../../examples')

/** @param {string} dir @returns {string[]} */
function miniFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : miniFiles(path)
    return entry.name.endsWith('.mini') ? [path] : []
  })
}

/** @param {Uint8Array} bytes */
function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Sizes of every picture next to a game, keyed the ways a game may name them. @param {string} file */
function sizesFor(file) {
  const assets = join(file, '..', 'assets')
  /** @type {Record<string, { width: number; height: number }>} */
  const sizes = {}
  if (!existsSync(assets)) return sizes
  for (const name of readdirSync(assets)) {
    if (!name.endsWith('.png')) continue
    const size = pngSize(readFileSync(join(assets, name)))
    sizes[name] = size
    sizes[`assets/${name}`] = size
  }
  return sizes
}

const files = miniFiles(root)

describe('examples', () => {
  it('has the showcase games and the basics', () => {
    const names = files.map((f) => relative(root, f))
    for (const name of ['cloud-hopper/game.mini', 'star-defender/game.mini', 'crypt-dash/game.mini', 'basics/platformer.mini']) {
      expect(names).toContain(name)
    }
  })

  for (const file of files) {
    it(`${relative(root, file)} compiles and runs 900 ticks cleanly`, async () => {
      const { program, errors } = compile(readFileSync(file, 'utf8'))
      expect(errors).toEqual([])
      if (!program) return
      const sizes = sizesFor(file)
      const input = new ManualInput()
      const sim = await Simulation.create(program, { input, assets: new StaticAssetLoader(sizes), random: () => 0.5 })
      // Every picture the game names must exist.
      expect(sim.errors.filter((e) => e.code === 'image-missing')).toEqual([])
      input.keyDown('right')
      for (let i = 0; i < 900; i++) {
        if (i % 90 === 0) input.tap('space')
        if (i % 120 === 0) input.click(sim.program.game.width / 2, sim.program.game.height / 2)
        sim.tick()
      }
      expect(sim.errors).toEqual([])
    })
  }
})
