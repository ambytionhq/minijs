import { describe, expect, it } from 'vitest'
import {
  act,
  and,
  bin,
  compare,
  keyHeld,
  look,
  not,
  num,
  onGround,
  or,
  program,
  prop,
  ref,
  rule,
  thing,
  variable,
  when,
} from './build.js'
import { sim, ticks } from './helpers.js'

const score = () => variable('score', 0)

describe('triggers', () => {
  it('game starts fires once on the first tick', () => {
    const { s } = sim(program({ vars: [score()], rules: [rule(when.gameStarts(), act.add(1, 'score'))] }))
    ticks(s, 5)
    expect(s.getVar('score')).toBe(1)
  })

  it('always fires every tick', () => {
    const { s } = sim(program({ vars: [score()], rules: [rule(when.always(), act.add(1, 'score'))] }))
    ticks(s, 5)
    expect(s.getVar('score')).toBe(5)
  })

  it('key pressed, held and released fire on the right ticks', () => {
    const { s, input } = sim(
      program({
        vars: [variable('p'), variable('h'), variable('r')],
        rules: [
          rule(when.key('space', 'pressed'), act.add(1, 'p')),
          rule(when.key('space', 'held'), act.add(1, 'h')),
          rule(when.key('space', 'released'), act.add(1, 'r')),
        ],
      }),
    )
    input.keyDown('space')
    ticks(s, 3)
    input.keyUp('space')
    ticks(s, 2)
    expect([s.getVar('p'), s.getVar('h'), s.getVar('r')]).toEqual([1, 3, 1])
  })

  it('event guards gate the actions', () => {
    const { s, input } = sim(
      program({
        vars: [score(), variable('armed', 0)],
        rules: [rule(when.key('space', 'pressed', compare(ref('armed'), 'is', 1)), act.add(1, 'score'))],
      }),
    )
    input.tap('space')
    s.tick()
    expect(s.getVar('score')).toBe(0)
    s.vars[1] = 1
    input.tap('space')
    s.tick()
    expect(s.getVar('score')).toBe(1)
  })

  it('every n seconds fires at n, 2n, ...', () => {
    const { s } = sim(program({ vars: [score()], rules: [rule(when.every(1), act.add(1, 'score'))] }))
    ticks(s, 60)
    expect(s.getVar('score')).toBe(0)
    s.tick()
    expect(s.getVar('score')).toBe(1)
    ticks(s, 60)
    expect(s.getVar('score')).toBe(2)
  })

  it('after n seconds fires exactly once', () => {
    const { s } = sim(program({ vars: [score()], rules: [rule(when.after(0.5), act.add(1, 'score'))] }))
    ticks(s, 30)
    expect(s.getVar('score')).toBe(0)
    ticks(s, 200)
    expect(s.getVar('score')).toBe(1)
  })

  it('condition rules fire on the rising edge only', () => {
    const { s } = sim(
      program({
        vars: [variable('n'), variable('hits')],
        rules: [
          rule(when.always(), act.add(1, 'n')),
          rule(when.condition(compare(ref('n'), 'above', 2)), act.add(1, 'hits')),
          rule(when.condition(compare(ref('n'), 'is', 10)), act.setVar('n', 0)),
        ],
      }),
    )
    ticks(s, 5)
    expect(s.getVar('hits')).toBe(1)
    ticks(s, 10)
    expect(s.getVar('hits')).toBe(2)
  })

  it('touch rules bind the colliding instances', () => {
    const { s } = sim(
      program({
        vars: [score()],
        things: [
          thing('player', { look: look.box(10, 10), at: [[0, 0]] }),
          thing('coin', {
            look: look.box(4, 4),
            at: [
              [5, 5],
              [50, 50],
              [10, 0],
            ],
          }),
        ],
        rules: [rule(when.touch('player', 'coin'), act.remove('coin'), act.add(1, 'score'))],
      }),
    )
    s.tick()
    expect(s.getVar('score')).toBe(2)
    expect(s.instancesOf('coin').map((c) => [c.x, c.y])).toEqual([[50, 50]])
  })

  it('touch is reported once per pair even with two players on one coin', () => {
    const { s } = sim(
      program({
        vars: [score()],
        things: [
          thing('player', {
            look: look.box(10, 10),
            at: [
              [0, 0],
              [2, 0],
            ],
          }),
          thing('coin', { look: look.box(4, 4), at: [[4, 4]] }),
        ],
        rules: [rule(when.touch('player', 'coin'), act.remove('coin'), act.add(1, 'score'))],
      }),
    )
    s.tick()
    expect(s.getVar('score')).toBe(1)
  })

  it('touch keeps firing while overlapping', () => {
    const { s } = sim(
      program({
        vars: [score()],
        things: [thing('a', { at: [[0, 0]] }), thing('b', { at: [[5, 5]] })],
        rules: [rule(when.touch('a', 'b'), act.add(1, 'score'))],
      }),
    )
    ticks(s, 4)
    expect(s.getVar('score')).toBe(4)
  })

  it('solid things resting against each other still touch', () => {
    const { s } = sim(
      program({
        vars: [score()],
        game: { gravity: 1 },
        things: [
          thing('player', { look: look.box(10, 10), at: [[0, 0]], solid: true, falls: true }),
          thing('lava', { look: look.box(50, 10), at: [[0, 20]], solid: true, fixed: true }),
        ],
        rules: [rule(when.touch('player', 'lava'), act.setVar('score', 1))],
      }),
    )
    ticks(s, 30)
    expect(s.getVar('score')).toBe(1)
  })

  it('touch guards see the bound instance', () => {
    const { s } = sim(
      program({
        vars: [score()],
        things: [
          thing('player', { look: look.box(100, 100), at: [[0, 0]] }),
          thing('coin', {
            look: look.box(4, 4),
            at: [
              [5, 5],
              [60, 60],
            ],
          }),
        ],
        rules: [rule(when.touch('player', 'coin', compare(prop('coin', 'x'), 'above', 30)), act.remove('coin'))],
      }),
    )
    s.tick()
    expect(s.instancesOf('coin').map((c) => c.x)).toEqual([5])
  })

  it('mouse click on a thing binds the clicked instance', () => {
    const { s, input } = sim(
      program({
        things: [
          thing('button', {
            look: look.box(10, 10),
            at: [
              [0, 0],
              [20, 0],
            ],
          }),
        ],
        rules: [rule(when.click('button'), act.remove('button'))],
      }),
    )
    input.click(25, 5)
    s.tick()
    expect(s.instancesOf('button').map((b) => b.x)).toEqual([0])
  })

  it('plain mouse click fires once per click', () => {
    const { s, input } = sim(program({ vars: [score()], rules: [rule(when.click(), act.add(1, 'score'))] }))
    input.click(1, 1)
    ticks(s, 3)
    expect(s.getVar('score')).toBe(1)
  })

  it('leaves the screen fires once when an instance goes fully outside', () => {
    const { s } = sim(
      program({
        vars: [score()],
        game: { width: 100, height: 100 },
        things: [thing('rock', { look: look.box(10, 10), at: [[80, 0]] })],
        rules: [rule(when.always(), act.move('rock', 'right', 5)), rule(when.leaves('rock'), act.add(1, 'score'))],
      }),
    )
    ticks(s, 4)
    expect(s.getVar('score')).toBe(0)
    ticks(s, 20)
    expect(s.getVar('score')).toBe(1)
  })

  it('two leaves rules on one thing both fire', () => {
    const { s } = sim(
      program({
        vars: [variable('a'), variable('b')],
        game: { width: 100, height: 100 },
        things: [thing('rock', { look: look.box(10, 10), at: [[95, 0]] })],
        rules: [
          rule(when.always(), act.move('rock', 'right', 5)),
          rule(when.leaves('rock'), act.add(1, 'a')),
          rule(when.leaves('rock'), act.add(1, 'b')),
        ],
      }),
    )
    ticks(s, 5)
    expect([s.getVar('a'), s.getVar('b')]).toEqual([1, 1])
  })

  it('things spawned offscreen do not count as leaving', () => {
    const { s } = sim(
      program({
        vars: [score()],
        game: { width: 100, height: 100 },
        things: [thing('rock', { look: look.box(10, 10) })],
        rules: [rule(when.gameStarts(), act.make('rock', 500, 500)), rule(when.leaves('rock'), act.add(1, 'score'))],
      }),
    )
    ticks(s, 5)
    expect(s.getVar('score')).toBe(0)
  })

  it('rules run in source order within a tick', () => {
    const { s } = sim(
      program({
        vars: [variable('n', 1)],
        rules: [rule(when.always(), act.setVar('n', bin('*', ref('n'), num(2)))), rule(when.always(), act.add(1, 'n'))],
      }),
    )
    s.tick()
    expect(s.getVar('n')).toBe(3)
  })
})

describe('conditions', () => {
  it('evaluates and, or, not, key held and on ground', () => {
    const { s, input } = sim(
      program({
        vars: [variable('a'), variable('b'), variable('c')],
        game: { gravity: 1 },
        things: [
          thing('player', { look: look.box(10, 10), at: [[0, 0]], solid: true, falls: true }),
          thing('floor', { look: look.box(50, 10), at: [[0, 10]], solid: true, fixed: true }),
        ],
        rules: [
          rule(when.condition(and(onGround('player'), keyHeld('x'))), act.setVar('a', 1)),
          rule(when.condition(or(compare(ref('a'), 'is', 1), compare(ref('b'), 'is', 5))), act.setVar('b', 2)),
          rule(when.condition(not(onGround('player'))), act.setVar('c', 7)),
        ],
      }),
    )
    s.tick()
    expect(s.getVar('c')).toBe(7)
    input.keyDown('x')
    ticks(s, 2)
    expect(s.getVar('a')).toBe(1)
    expect(s.getVar('b')).toBe(2)
  })
})
