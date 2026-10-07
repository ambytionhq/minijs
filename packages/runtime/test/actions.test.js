import { describe, expect, it } from 'vitest'
import {
  act,
  animation,
  bin,
  count,
  look,
  mouse,
  num,
  program,
  prop,
  random,
  ref,
  rule,
  thing,
  variable,
  when,
} from './build.js'
import { sim, ticks } from './helpers.js'

describe('actions', () => {
  it('move nudges position for one tick only', () => {
    const { s } = sim(
      program({ things: [thing('p', { at: [[0, 0]] })], rules: [rule(when.gameStarts(), act.move('p', 'down', 4))] }),
    )
    ticks(s, 3)
    expect(s.instancesOf('p')[0].y).toBe(4)
  })

  it('push adds velocity and stop clears it', () => {
    const { s, input } = sim(
      program({
        things: [thing('p', { at: [[0, 0]] })],
        rules: [
          rule(when.gameStarts(), act.push('p', 'left', 2), act.push('p', 'up', 1)),
          rule(when.key('s', 'pressed'), act.halt('p')),
        ],
      }),
    )
    ticks(s, 2)
    expect(s.instancesOf('p')[0]).toMatchObject({ x: -4, y: -2, vx: -2, vy: -1 })
    input.tap('s')
    ticks(s, 2)
    expect(s.instancesOf('p')[0]).toMatchObject({ x: -4, y: -2, vx: 0, vy: 0 })
  })

  it('unbound names apply to every instance', () => {
    const { s } = sim(
      program({
        things: [
          thing('e', {
            at: [
              [0, 0],
              [10, 0],
              [20, 0],
            ],
          }),
        ],
        rules: [rule(when.gameStarts(), act.move('e', 'down', 3))],
      }),
    )
    s.tick()
    expect(s.instancesOf('e').map((e) => e.y)).toEqual([3, 3, 3])
  })

  it('set, add and subtract variables', () => {
    const { s } = sim(
      program({
        vars: [variable('a', 5), variable('b')],
        rules: [
          rule(when.gameStarts(), act.setVar('b', bin('+', ref('a'), num(1))), act.add(10, 'a'), act.subtract(2, 'b')),
        ],
      }),
    )
    s.tick()
    expect([s.getVar('a'), s.getVar('b')]).toEqual([15, 4])
  })

  it('set prop teleports and snaps previous position', () => {
    const { s } = sim(
      program({
        things: [thing('p', { at: [[0, 0]] })],
        rules: [rule(when.gameStarts(), act.setProp('p', 'x', 50), act.setProp('p', 'vy', 2))],
      }),
    )
    s.tick()
    expect(s.world.prevX[0]).toBe(50)
    expect(s.instancesOf('p')[0]).toMatchObject({ x: 50, y: 2, vy: 2 })
  })

  it('make spawns at end of tick; remove despawns', () => {
    const { s } = sim(
      program({
        vars: [variable('seen')],
        things: [thing('coin')],
        rules: [
          rule(when.gameStarts(), act.make('coin', 7, 8), act.make('coin', 1, 2)),
          rule(when.always(), act.setVar('seen', count('coin'))),
        ],
      }),
    )
    s.tick()
    expect(s.getVar('seen')).toBe(0)
    expect(s.instancesOf('coin').map((c) => [c.x, c.y])).toEqual([
      [7, 8],
      [1, 2],
    ])
    s.tick()
    expect(s.getVar('seen')).toBe(2)
  })

  it('expressions read props, counts, mouse and random', () => {
    const { s, input } = sim(
      program({
        vars: [variable('px'), variable('n'), variable('mx'), variable('r')],
        things: [
          thing('p', { look: look.box(4, 6), at: [[3, 9]] }),
          thing('q', {
            at: [
              [0, 0],
              [0, 0],
            ],
          }),
        ],
        rules: [
          rule(
            when.always(),
            act.setVar('px', bin('+', prop('p', 'x'), prop('p', 'height'))),
            act.setVar('n', count('q')),
            act.setVar('mx', mouse('x')),
            act.setVar('r', random(num(1), num(6))),
          ),
        ],
      }),
      { random: () => 0.99 },
    )
    input.pointerMove(40, 50)
    s.tick()
    expect([s.getVar('px'), s.getVar('n'), s.getVar('mx'), s.getVar('r')]).toEqual([9, 2, 40, 6])
  })

  it('props of a thing with no instances read as 0', () => {
    const { s } = sim(
      program({
        vars: [variable('v', 5)],
        things: [thing('ghost')],
        rules: [rule(when.always(), act.setVar('v', prop('ghost', 'x')))],
      }),
    )
    s.tick()
    expect(s.getVar('v')).toBe(0)
  })

  it('division by zero yields 0 and reports once', () => {
    const { s } = sim(
      program({ vars: [variable('v', 5)], rules: [rule(when.always(), act.setVar('v', bin('/', num(1), num(0))))] }),
    )
    ticks(s, 3)
    expect(s.getVar('v')).toBe(0)
    expect(s.errors.map((e) => e.code)).toEqual(['runtime-math'])
  })

  it('play animation does not restart when already playing; stop returns to base look', () => {
    const { s, input } = sim(
      program({
        things: [thing('p', { at: [[0, 0]], animations: [animation('walk', ['a.png', 'b.png'], 10)] })],
        rules: [
          rule(when.key('right', 'held'), act.play('walk', 'p')),
          rule(when.key('right', 'released'), act.stopAnimation('p')),
        ],
      }),
    )
    input.keyDown('right')
    ticks(s, 5)
    expect(s.instancesOf('p')[0].animation).toBe('walk')
    expect(s.world.animTicks[0]).toBe(5)
    input.keyUp('right')
    s.tick()
    expect(s.instancesOf('p')[0].animation).toBeNull()
  })

  it('change look swaps look and stops animation', () => {
    const red = look.box(5, 5, 'red')
    const { s } = sim(
      program({
        things: [thing('p', { at: [[0, 0]], animations: [animation('walk', ['a.png'], 10)] })],
        rules: [rule(when.gameStarts(), act.play('walk', 'p')), rule(when.after(0.1), act.changeLook('p', red))],
      }),
    )
    ticks(s, 7)
    expect(s.instancesOf('p')[0].animation).toBeNull()
    expect(s.catalog.looks[s.world.look[0]].color).toBe('red')
  })
})

describe('text', () => {
  it('shows interpolated text that updates and persists', () => {
    const { s } = sim(
      program({
        vars: [variable('score', 0)],
        rules: [
          rule(when.always(), act.add(1, 'score'), act.showText(['Score: ', ref('score'), '!'], [4, 4], 'yellow')),
        ],
      }),
    )
    ticks(s, 3)
    expect(s.text.slots[0]).toMatchObject({
      visible: true,
      text: 'Score: 3!',
      x: 4,
      y: 4,
      centered: false,
      color: 'yellow',
    })
  })

  it('formats decimals to at most 2 places', () => {
    const { s } = sim(
      program({ vars: [variable('v', 1.23456)], rules: [rule(when.gameStarts(), act.showText(['v=', ref('v')]))] }),
    )
    s.tick()
    expect(s.text.slots[0]).toMatchObject({ text: 'v=1.23', centered: true })
  })

  it('does not rebuild the string when values are unchanged', () => {
    const { s } = sim(
      program({ vars: [variable('v', 1)], rules: [rule(when.always(), act.showText(['v=', ref('v')]))] }),
    )
    s.tick()
    const first = s.text.slots[0].text
    s.tick()
    expect(s.text.slots[0].text).toBe(first)
  })
})
