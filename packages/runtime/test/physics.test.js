import { describe, expect, it } from 'vitest'
import { overlapsStrict, touchesInclusive } from '../src/physics.js'
import { act, look, program, rule, thing, when } from './build.js'
import { sim, ticks } from './helpers.js'

describe('overlap tests', () => {
  it('strict overlap ignores edge contact', () => {
    expect(overlapsStrict(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false)
    expect(overlapsStrict(0, 0, 10, 10, 9, 0, 10, 10)).toBe(true)
  })
  it('inclusive touch counts edge contact', () => {
    expect(touchesInclusive(0, 0, 10, 10, 10, 0, 10, 10)).toBe(true)
    expect(touchesInclusive(0, 0, 10, 10, 10.5, 0, 10, 10)).toBe(false)
  })
})

const ground = () => thing('ground', { look: look.box(200, 20), at: [[0, 100]], solid: true, fixed: true })

describe('Physics', () => {
  it('moves by velocity each tick', () => {
    const { s } = sim(
      program({
        things: [thing('ball', { at: [[0, 0]] })],
        rules: [rule(when.gameStarts(), act.push('ball', 'right', 2))],
      }),
    )
    ticks(s, 3)
    expect(s.instancesOf('ball')[0].x).toBe(6)
  })

  it('applies gravity only to things that fall', () => {
    const { s } = sim(
      program({
        game: { gravity: 0.5 },
        things: [thing('rock', { at: [[0, 0]], falls: true }), thing('cloud', { at: [[50, 0]] })],
      }),
    )
    ticks(s, 2)
    expect(s.instancesOf('rock')[0].vy).toBe(1)
    expect(s.instancesOf('rock')[0].y).toBe(1.5)
    expect(s.instancesOf('cloud')[0].y).toBe(0)
  })

  it('lands on solid ground, sets on ground, and zeroes vertical speed', () => {
    const { s } = sim(
      program({
        game: { gravity: 0.5 },
        things: [thing('player', { look: look.box(10, 10), at: [[20, 80]], solid: true, falls: true }), ground()],
      }),
    )
    ticks(s, 60)
    const p = s.instancesOf('player')[0]
    expect(p.y).toBe(90)
    expect(p.vy).toBe(0)
    expect(p.onGround).toBe(true)
  })

  it('does not snag on the ground when walking sideways', () => {
    const { s, input } = sim(
      program({
        game: { gravity: 0.5 },
        things: [thing('player', { look: look.box(10, 10), at: [[20, 89]], solid: true, falls: true }), ground()],
        rules: [rule(when.key('right', 'held'), act.move('player', 'right', 2))],
      }),
    )
    ticks(s, 10)
    input.keyDown('right')
    ticks(s, 10)
    const p = s.instancesOf('player')[0]
    expect(p.x).toBe(40)
    expect(p.y).toBe(90)
  })

  it('stops at walls', () => {
    const { s } = sim(
      program({
        things: [
          thing('player', { look: look.box(10, 10), at: [[0, 0]], solid: true }),
          thing('wall', { look: look.box(10, 50), at: [[30, 0]], solid: true, fixed: true }),
        ],
        rules: [rule(when.always(), act.move('player', 'right', 3))],
      }),
    )
    ticks(s, 20)
    expect(s.instancesOf('player')[0].x).toBe(20)
  })

  it('does not tunnel through thin floors at high speed', () => {
    const { s } = sim(
      program({
        things: [
          thing('bullet', { look: look.box(4, 4), at: [[10, 0]], solid: true }),
          thing('floor', { look: look.box(50, 2), at: [[0, 30]], solid: true, fixed: true }),
        ],
        rules: [rule(when.gameStarts(), act.push('bullet', 'down', 25))],
      }),
    )
    ticks(s, 3)
    expect(s.instancesOf('bullet')[0].y).toBe(26)
  })

  it('stops a jump at the ceiling', () => {
    const { s } = sim(
      program({
        things: [
          thing('player', { look: look.box(10, 10), at: [[0, 50]], solid: true }),
          thing('ceiling', { look: look.box(50, 10), at: [[0, 0]], solid: true, fixed: true }),
        ],
        rules: [rule(when.gameStarts(), act.push('player', 'up', 30))],
      }),
    )
    ticks(s, 5)
    const p = s.instancesOf('player')[0]
    expect(p.y).toBe(10)
    expect(p.vy).toBe(0)
    expect(p.onGround).toBe(false)
  })

  it('moves fixed things only by move, without push-out', () => {
    const { s } = sim(
      program({
        things: [thing('platform', { at: [[0, 0]], solid: true, fixed: true, falls: true })],
        rules: [rule(when.always(), act.move('platform', 'right', 1), act.push('platform', 'down', 5))],
      }),
    )
    ticks(s, 4)
    const p = s.instancesOf('platform')[0]
    expect(p.x).toBe(4)
    expect(p.y).toBe(0)
  })

  it('non-solid things pass through solids', () => {
    const { s } = sim(
      program({
        things: [
          thing('ghost', { at: [[0, 0]] }),
          thing('wall', { look: look.box(10, 50), at: [[15, 0]], solid: true, fixed: true }),
        ],
        rules: [rule(when.always(), act.move('ghost', 'right', 5))],
      }),
    )
    ticks(s, 10)
    expect(s.instancesOf('ghost')[0].x).toBe(50)
  })
})
