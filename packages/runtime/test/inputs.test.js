// Keys, mouse buttons, gamepads, sticks and controls, end to end through Simulation.

import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'
import { BrowserInput, ManualInput, STICK_DEADZONE } from '../src/input.js'
import { Simulation } from '../src/simulation.js'
import {
  act,
  compare,
  control,
  controlHeld,
  keyHeld,
  look,
  mouseHeld,
  mouseOver,
  padHeld,
  program,
  ref,
  rule,
  stick,
  thing,
  variable,
  when,
} from './build.js'

/** Program with one counter `n` and the given rules. */
function counter(rules, extra = {}) {
  return program({ vars: [variable('n', 0)], rules, ...extra })
}

/** @param {import('@minijs/lang').Program} p */
function sim(p, input = new ManualInput()) {
  const logs = []
  const s = new Simulation(p, new Map(), { input, onLog: (text, tick) => logs.push([text, tick]) })
  return { s, input, logs }
}

describe('keys', () => {
  it('"any key" presses once while several keys are down', () => {
    const { s, input } = sim(counter([rule(when.key('any', 'pressed'), act.add(1, 'n'))]))
    input.keyDown('a')
    s.tick()
    input.keyDown('b')
    s.tick()
    input.keyUp('a')
    s.tick()
    expect(s.getVar('n')).toBe(1)
    input.keyUp('b')
    s.tick()
    input.tap('tab')
    s.tick()
    expect(s.getVar('n')).toBe(2)
  })

  it('"any key is held" and released follow the last key up', () => {
    const p = counter([
      rule(when.always(), act.setVar('n', 0)),
      rule(when.condition(keyHeld('any')), act.setVar('n', 1)),
      rule(when.key('any', 'released'), act.setVar('n', 5)),
    ])
    const { s, input } = sim(p)
    input.keyDown('ctrl')
    s.tick()
    expect(s.getVar('n')).toBe(1)
    input.keyUp('ctrl')
    s.tick()
    expect(s.getVar('n')).toBe(5)
  })
})

describe('mouse buttons', () => {
  it('fires pressed, held and released for each button', () => {
    const p = program({
      vars: [variable('left', 0), variable('right', 0), variable('middle', 0), variable('up', 0)],
      rules: [
        rule(when.mouse('left', 'pressed'), act.add(1, 'left')),
        rule(when.mouse('right', 'held'), act.add(1, 'right')),
        rule(when.mouse('middle', 'released'), act.add(1, 'middle')),
        rule(when.condition(mouseHeld('right')), act.add(1, 'up')),
      ],
    })
    const { s, input } = sim(p)
    input.pointerDown(5, 5, 'right')
    s.tick()
    s.tick()
    input.pointerUp('right')
    s.tick()
    input.click(5, 5)
    input.click(5, 5, 'middle')
    s.tick()
    expect([s.getVar('left'), s.getVar('right'), s.getVar('middle'), s.getVar('up')]).toEqual([1, 2, 1, 1])
  })

  it('right-click on a thing binds the clicked one, held keeps firing over it', () => {
    const p = program({
      vars: [variable('n', 0)],
      things: [thing('crate', { look: look.box(10, 10), at: [[0, 0], [20, 0]] })],
      rules: [
        rule(when.mouse('right', 'pressed', 'crate'), act.remove('crate')),
        rule(when.mouse('left', 'held', 'crate'), act.add(1, 'n')),
      ],
    })
    const { s, input } = sim(p)
    input.pointerDown(25, 5, 'left')
    s.tick()
    s.tick()
    input.pointerUp('left')
    s.tick()
    expect(s.getVar('n')).toBe(2)
    input.click(25, 5, 'right')
    s.tick()
    expect(s.instancesOf('crate').map((c) => c.x)).toEqual([0])
  })

  it('knows when the mouse is over a thing', () => {
    const p = program({
      vars: [variable('n', 0)],
      things: [thing('button', { look: look.box(10, 10), at: [[50, 50]] })],
      rules: [rule(when.always(), act.setVar('n', 0)), rule(when.condition(mouseOver('button')), act.setVar('n', 1))],
    })
    const { s, input } = sim(p)
    input.pointerMove(55, 55)
    s.tick()
    expect(s.getVar('n')).toBe(1)
    input.pointerMove(5, 5)
    s.tick()
    expect(s.getVar('n')).toBe(0)
  })
})

describe('gamepads', () => {
  it('reads buttons per pad', () => {
    const p = program({
      vars: [variable('one', 0), variable('two', 0), variable('held', 0)],
      rules: [
        rule(when.pad(1, 'a', 'pressed'), act.add(1, 'one')),
        rule(when.pad(2, 'a', 'released'), act.add(1, 'two')),
        rule(when.pad(1, 'start', 'held'), act.add(1, 'held')),
        // Rising edge: once, even though start stays held.
        rule(when.condition(padHeld(1, 'start')), act.add(100, 'held')),
      ],
    })
    const { s, input } = sim(p)
    input.padDown(1, 'a')
    input.padDown(2, 'a')
    input.padDown(1, 'start')
    s.tick()
    s.tick()
    input.padUp(2, 'a')
    s.tick()
    expect([s.getVar('one'), s.getVar('two'), s.getVar('held')]).toEqual([1, 1, 103])
  })

  it('reads sticks with a deadzone', () => {
    const p = counter([rule(when.always(), act.setVar('n', stick(1, 'right', 'y')))])
    const { s, input } = sim(p)
    input.setStick(1, 'right', 'y', STICK_DEADZONE / 2)
    s.tick()
    expect(s.getVar('n')).toBe(0)
    input.setStick(1, 'right', 'y', -1)
    s.tick()
    expect(s.getVar('n')).toBe(-1)
    input.setStick(1, 'right', 'y', 0.5)
    s.tick()
    expect(s.getVar('n')).toBeCloseTo((0.5 - STICK_DEADZONE) / (1 - STICK_DEADZONE))
  })

  it('polls browser gamepads, packing connected pads from 1', () => {
    const input = new BrowserInput()
    const pressed = (on) => Array.from({ length: 17 }, (_, i) => ({ pressed: on.includes(i), value: on.includes(i) ? 1 : 0 }))
    let pads = [null, { connected: true, buttons: pressed([0, 7]), axes: [0.9, 0, 0, 0] }]
    input.readPads = () => pads
    const p = counter([
      rule(when.pad(1, 'a', 'pressed'), act.add(1, 'n')),
      rule(when.pad(1, 'rt', 'held'), act.add(10, 'n')),
    ])
    const s = new Simulation(p, new Map(), { input })
    s.tick()
    expect(s.getVar('n')).toBe(11)
    expect(input.sticks[0]).toBeGreaterThan(0.8)
    pads = [null, null]
    s.tick()
    expect(input.padConnected[0]).toBe(0)
    expect(input.pads.released[0]).toBe(1)
    expect(input.sticks[0]).toBe(0)
  })
})

describe('controls', () => {
  const jump = control('jump', { kind: 'key', key: 'space' }, { kind: 'key', key: 'up' }, { kind: 'pad', pad: 1, button: 'a' })

  it('presses once even when two of its inputs overlap', () => {
    const p = counter(
      [
        rule(when.control('jump', 'pressed'), act.add(1, 'n')),
        rule(when.control('jump', 'released'), act.add(100, 'n')),
      ],
      { controls: [jump] },
    )
    const { s, input } = sim(p)
    input.keyDown('space')
    s.tick()
    input.padDown(1, 'a')
    s.tick()
    input.keyUp('space')
    s.tick()
    expect(s.getVar('n')).toBe(1)
    input.padUp(1, 'a')
    s.tick()
    expect(s.getVar('n')).toBe(101)
  })

  it('catches a tap shorter than one tick', () => {
    const p = counter(
      [rule(when.control('jump', 'pressed'), act.add(1, 'n')), rule(when.control('jump', 'released'), act.add(10, 'n'))],
      { controls: [jump] },
    )
    const { s, input } = sim(p)
    input.tap('up')
    s.tick()
    s.tick()
    expect(s.getVar('n')).toBe(11)
  })

  it('works as a condition and resets on restart', () => {
    const p = counter([rule(when.condition(controlHeld('jump')), act.add(1, 'n'))], { controls: [jump] })
    const { s, input } = sim(p)
    input.keyDown('space')
    s.tick()
    s.restart()
    expect(s.controls.held[0]).toBe(0)
    s.tick()
    expect(s.getVar('n')).toBe(1)
  })
})

describe('log', () => {
  it('sends formatted lines with the tick they ran on', () => {
    const p = counter([
      rule(when.every(1 / 60), act.add(0.5, 'n'), act.log(['n is ', ref('n'), '!'])),
      rule(when.condition(compare(ref('n'), 'is', 1)), act.log(['one'])),
    ])
    const { s, logs } = sim(p)
    s.tick()
    s.tick()
    s.tick()
    expect(logs).toEqual([
      ['n is 0.5!', 1],
      ['n is 1!', 2],
      ['one', 2],
    ])
  })
})

describe('from source', () => {
  it('runs a game that mixes keyboard, gamepad and mouse through one control', () => {
    const src = [
      'n starts at 0',
      'control fire',
      '  space key',
      '  gamepad rt',
      '  right mouse',
      'when fire is pressed',
      '  add 1 to n',
      'when gamepad stick x is above 0.5',
      '  add 10 to n',
    ].join('\n')
    const { program: p, errors } = compile(src)
    expect(errors).toEqual([])
    if (!p) return
    const { s, input } = sim(p)
    input.tap('space')
    s.tick()
    s.tick() // let go, so the next input is a new press
    input.padDown(1, 'rt')
    s.tick()
    input.padUp(1, 'rt')
    s.tick()
    s.tick()
    input.click(1, 1, 'right')
    s.tick()
    input.setStick(1, 'left', 'x', 1)
    s.tick()
    s.tick()
    expect(s.getVar('n')).toBe(13)
  })
})
