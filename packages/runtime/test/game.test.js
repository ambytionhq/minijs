import { describe, expect, it, vi } from 'vitest'
import { Game } from '../src/game.js'
import { TICK_MS } from '../src/config.js'
import { RecordingRenderer } from '../src/render/renderer.js'
import { act, program, rule, thing, when } from './build.js'
import { sim } from './helpers.js'

function harness(p) {
  const callbacks = []
  const game = new Game({}, { scheduler: { request: (cb) => callbacks.push(cb), cancel: () => {} } })
  game.simulation = sim(p).s
  game.renderer = new RecordingRenderer()
  return { game, callbacks }
}

describe('Game rendering lifecycle', () => {
  it('keeps the current position visible when Stop cancels animation frames', () => {
    const { game, callbacks } = harness(program({
      things: [thing('p', { at: [[0, 0]] })],
      rules: [rule(when.always(), act.move('p', 'right', 10))],
    }))
    game.loop.start()
    callbacks[0](0)
    callbacks[1](TICK_MS)
    const draw = vi.spyOn(game.renderer, 'begin')
    game.stop()
    expect(game.loop.isRunning).toBe(false)
    expect(game.simulation.stopped).toBe(true)
    expect(game.renderer.calls[1]).toMatchObject({ op: 'box', x: 10 })
    callbacks[2](TICK_MS * 2)
    expect(draw).toHaveBeenCalledTimes(1)
  })

  it('draws the final game state once when a rule stops the game', () => {
    const { game, callbacks } = harness(program({
      things: [thing('p', { at: [[0, 0]] })],
      rules: [rule(when.always(), act.move('p', 'right', 10), act.stopGame())],
    }))
    game.loop.start()
    callbacks[0](0)
    callbacks[1](TICK_MS)
    expect(game.loop.isRunning).toBe(false)
    expect(game.renderer.calls[1]).toMatchObject({ op: 'box', x: 10 })
    expect(callbacks).toHaveLength(2)
  })
})
