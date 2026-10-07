// compile() + Simulation end to end: the language and the runtime agree on the spec example.

import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'
import { SPEC_EXAMPLE } from '../../lang/test/fixtures.js'
import { ManualInput } from '../src/input.js'
import { Simulation } from '../src/simulation.js'
import { specExample } from './spec-example.js'

/**
 * Deep copy without `loc` keys.
 * @param {unknown} value
 * @returns {any}
 */
function strip(value) {
  if (Array.isArray(value)) return value.map(strip)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== 'loc')
        .map(([k, v]) => [k, strip(v)]),
    )
  }
  return value
}

describe('integration', () => {
  it('compiles the spec example to the hand-built program', () => {
    const { program, errors } = compile(SPEC_EXAMPLE)
    expect(errors).toEqual([])
    expect(strip(program)).toEqual(strip(specExample))
  })

  it('runs the spec example: player lands, walks, collects', () => {
    const { program } = compile(SPEC_EXAMPLE)
    if (!program) throw new Error('spec example did not compile')
    const input = new ManualInput()
    // random 0.5 -> coins spawn at x 300, y 140 every 2 seconds, in the player's path
    const sim = new Simulation(program, new Map(), { input, random: () => 0.5 })
    for (let i = 0; i < 60; i++) sim.tick()
    expect(sim.instancesOf('player')[0]).toMatchObject({ y: 144, onGround: true })
    input.keyDown('right')
    for (let i = 0; i < 240; i++) sim.tick()
    expect(sim.instancesOf('player')[0].x).toBeGreaterThan(40)
    expect(sim.getVar('score')).toBeGreaterThan(0)
  })
})
