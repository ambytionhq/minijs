// The docs/spec.md section 7 example, built by hand. Stage 2's compile() must
// produce an equivalent Program (modulo locs); its integration test runs the
// same scenario from source text.

import { describe, expect, it } from 'vitest'
import { ManualInput } from '../src/input.js'
import { Simulation } from '../src/simulation.js'
import { act, compare, look, num, onGround, program, random, ref, rule, thing, variable, when } from './build.js'

export const specExample = program({
  game: { width: 320, height: 180, pixelArt: true, background: 'skyblue', gravity: 0.4 },
  vars: [variable('score', 0)],
  things: [
    thing('player', {
      look: look.box(12, 16, 'orange'),
      at: [[40, 100]],
      solid: true,
      falls: true,
      cameraFollows: true,
    }),
    thing('ground', { look: look.box(640, 20, 'seagreen'), at: [[0, 160]], solid: true, fixed: true }),
    thing('coin', { look: look.circle(4, 'gold') }),
  ],
  rules: [
    rule(when.key('left', 'held'), act.move('player', 'left', 2)),
    rule(when.key('right', 'held'), act.move('player', 'right', 2)),
    rule(when.key('up', 'pressed', onGround('player')), act.push('player', 'up', 7)),
    rule(when.touch('player', 'coin'), act.remove('coin'), act.add(1, 'score')),
    rule(when.every(2), act.make('coin', random(num(0), num(600)), 140)),
    rule(when.condition(compare(ref('score'), 'is', 10)), act.showText(['You win!']), act.stopGame()),
    rule(when.always(), act.showText(['Score: ', ref('score')], [4, 4])),
  ],
})

describe('spec example', () => {
  it('player lands, walks right, collects coins', () => {
    const input = new ManualInput()
    const sim = new Simulation(specExample, new Map(), { input, random: () => 0.5 })
    for (let i = 0; i < 60; i++) sim.tick()
    expect(sim.instancesOf('player')[0]).toMatchObject({ y: 144, onGround: true })
    input.keyDown('right')
    for (let i = 0; i < 240; i++) sim.tick()
    expect(sim.instancesOf('player')[0].x).toBeGreaterThan(40)
    expect(sim.getVar('score')).toBeGreaterThan(0)
  })

  it('jump only works from the ground', () => {
    const input = new ManualInput()
    const sim = new Simulation(specExample, new Map(), { input })
    for (let i = 0; i < 60; i++) sim.tick()
    input.tap('up')
    sim.tick()
    const airborne = sim.instancesOf('player')[0]
    expect(airborne.y).toBeLessThan(144)
    input.tap('up')
    sim.tick()
    expect(sim.instancesOf('player')[0].vy).toBeGreaterThan(-7)
  })
})
