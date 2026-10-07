// Runs the hand-built spec example (spec-example.js). integration.test.js runs
// the same scenario from source text through compile().

import { describe, expect, it } from 'vitest'
import { ManualInput } from '../src/input.js'
import { Simulation } from '../src/simulation.js'
import { specExample } from './spec-example.js'

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
