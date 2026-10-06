import { describe, expect, it } from 'vitest'
import { computeScale } from '../src/render/canvas2d.ts'
import { drawWorld } from '../src/render/draw-world.ts'
import { RecordingRenderer } from '../src/render/renderer.ts'
import { Simulation } from '../src/simulation.ts'
import { act, animation, look, program, ref, rule, thing, variable, when } from './build.ts'
import { sim } from './helpers.ts'

describe('drawWorld', () => {
  it('draws background, things in declaration order, then text', () => {
    const { s } = sim(
      program({
        game: { background: 'navy' },
        vars: [variable('score', 7)],
        things: [thing('back', { look: look.box(5, 5, 'red'), at: [[0, 0]] }), thing('front', { look: look.circle(2, 'gold'), at: [[1, 1]] })],
        rules: [rule(when.always(), act.showText(['S', ref('score')], [2, 3]))],
      }),
    )
    s.tick()
    const r = new RecordingRenderer()
    drawWorld(r, s, 1)
    expect(r.calls).toEqual([
      { op: 'begin', background: 'navy' },
      { op: 'box', x: 0, y: 0, w: 5, h: 5, color: 'red' },
      { op: 'ellipse', x: 1, y: 1, w: 4, h: 4, color: 'gold' },
      { op: 'text', text: 'S7', x: 2, y: 3, color: 'white', align: 'left' },
      { op: 'end' },
    ])
  })

  it('interpolates between previous and current positions', () => {
    const { s } = sim(program({ things: [thing('p', { at: [[0, 0]] })], rules: [rule(when.always(), act.move('p', 'right', 10))] }))
    s.tick()
    const r = new RecordingRenderer()
    drawWorld(r, s, 0.5)
    expect(r.calls[1]).toMatchObject({ op: 'box', x: 5 })
  })

  it('offsets by camera and culls offscreen things', () => {
    const { s } = sim(
      program({
        game: { width: 100, height: 100 },
        things: [
          thing('p', { look: look.box(10, 10), at: [[500, 500]], cameraFollows: true }),
          thing('far', { look: look.box(10, 10), at: [[0, 0]] }),
        ],
      }),
    )
    const r = new RecordingRenderer()
    drawWorld(r, s, 1)
    const boxes = r.calls.filter((c) => c.op === 'box')
    expect(boxes).toEqual([{ op: 'box', x: 45, y: 45, w: 10, h: 10, color: 'white' }])
  })

  it('centers text without a position', () => {
    const { s } = sim(program({ game: { width: 200, height: 100 }, rules: [rule(when.gameStarts(), act.showText(['You win!']))] }))
    s.tick()
    const r = new RecordingRenderer()
    drawWorld(r, s, 1)
    expect(r.calls).toContainEqual({ op: 'text', text: 'You win!', x: 100, y: 50, color: 'white', align: 'center' })
  })

  it('draws the current animation frame', () => {
    const p = program({
      things: [thing('p', { at: [[0, 0]], animations: [animation('walk', ['a.png', 'b.png'], 6)] })],
      rules: [rule(when.gameStarts(), act.play('walk', 'p'))],
    })
    const s = new Simulation(p, new Map())
    for (let i = 0; i < 11; i++) s.tick()
    const r = new RecordingRenderer()
    drawWorld(r, s, 1)
    expect(r.calls[1]).toMatchObject({ op: 'image', src: 'b.png' })
  })
})

describe('computeScale', () => {
  it('uses integer scale for pixel art', () => {
    expect(computeScale(320, 180, 1000, 700, 1, true)).toEqual({ canvasWidth: 960, canvasHeight: 540, cssWidth: 960, cssHeight: 540, scale: 3 })
  })
  it('includes device pixel ratio in pixel art scale', () => {
    expect(computeScale(320, 180, 1000, 700, 2, true)).toMatchObject({ canvasWidth: 1920, cssWidth: 960, scale: 6 })
  })
  it('never scales pixel art below 1', () => {
    expect(computeScale(320, 180, 100, 100, 1, true).scale).toBe(1)
  })
  it('caps device pixel ratio for smooth mode', () => {
    const fit = computeScale(400, 200, 800, 800, 3, false)
    expect(fit).toEqual({ canvasWidth: 1600, canvasHeight: 800, cssWidth: 800, cssHeight: 400, scale: 4 })
  })
})
