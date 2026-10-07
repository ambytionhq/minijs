// Every examples/*.mini compiles with zero problems and runs headless without runtime errors.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'
import { StaticAssetLoader } from '../src/assets.js'
import { ManualInput } from '../src/input.js'
import { Simulation } from '../src/simulation.js'

const dir = join(import.meta.dirname, '../../../examples')
const files = readdirSync(dir).filter((f) => f.endsWith('.mini'))

const HERO = { width: 16, height: 16 }
const sizes = { 'hero-idle.png': HERO, 'hero-1.png': HERO, 'hero-2.png': HERO, 'hero-3.png': HERO }

describe('examples', () => {
  it('has at least five examples', () => expect(files.length).toBeGreaterThanOrEqual(5))

  it('ships every image the examples use', () => {
    for (const name of Object.keys(sizes)) expect(readdirSync(join(dir, 'assets'))).toContain(name)
  })

  for (const file of files) {
    it(`${file} compiles and runs 600 ticks cleanly`, async () => {
      const { program, errors } = compile(readFileSync(join(dir, file), 'utf8'))
      expect(errors).toEqual([])
      if (!program) return
      const input = new ManualInput()
      const sim = await Simulation.create(program, { input, assets: new StaticAssetLoader(sizes), random: () => 0.5 })
      input.keyDown('right')
      for (let i = 0; i < 600; i++) {
        if (i % 90 === 0) input.tap('space')
        if (i % 120 === 0) input.click(sim.program.game.width / 2, sim.program.game.height / 2)
        sim.tick()
      }
      expect(sim.errors).toEqual([])
    })
  }
})
