import { describe, expect, it } from 'vitest'
import { StaticAssetLoader } from '../src/assets.js'
import { MAX_INSTANCES } from '../src/config.js'
import { Simulation } from '../src/simulation.js'
import { act, animation, compare, look, num, program, random, ref, rule, thing, variable, when } from './build.js'
import { sim, ticks } from './helpers.js'

describe('Simulation lifecycle', () => {
  it('stop game freezes the simulation and calls onStop once', () => {
    let stops = 0
    const p = program({
      vars: [variable('n')],
      rules: [rule(when.always(), act.add(1, 'n')), rule(when.condition(compare(ref('n'), 'is', 3)), act.stopGame())],
    })
    const s = new Simulation(p, new Map(), { onStop: () => stops++ })
    ticks(s, 10)
    expect(s.getVar('n')).toBe(3)
    expect(s.stopped).toBe(true)
    expect(stops).toBe(1)
  })

  it('restart game resets instances, vars, text, timers and edges', () => {
    const { s } = sim(
      program({
        vars: [variable('n'), variable('wins')],
        things: [thing('p', { at: [[0, 0]] })],
        rules: [
          rule(when.always(), act.add(1, 'n'), act.move('p', 'right', 1)),
          rule(when.condition(compare(ref('n'), 'is', 2)), act.add(1, 'wins'), act.showText(['hi'])),
          rule(when.condition(compare(ref('n'), 'is', 5)), act.restartGame()),
        ],
      }),
    )
    ticks(s, 5)
    expect(s.tickCount).toBe(0)
    expect(s.getVar('n')).toBe(0)
    expect(s.getVar('wins')).toBe(0)
    expect(s.instancesOf('p')[0].x).toBe(0)
    expect(s.text.slots[0].visible).toBe(false)
    ticks(s, 2)
    expect(s.getVar('wins')).toBe(1)
  })

  it('stops with too-many-things when spawning past the cap', () => {
    const { s } = sim(
      program({
        things: [thing('dot')],
        rules: [
          rule(
            when.always(),
            act.make('dot', 0, 0),
            act.make('dot', 0, 0),
            act.make('dot', 0, 0),
            act.make('dot', 0, 0),
          ),
        ],
      }),
    )
    ticks(s, MAX_INSTANCES / 4 + 2)
    expect(s.stopped).toBe(true)
    expect(s.errors.map((e) => e.code)).toEqual(['too-many-things'])
  })

  it('camera centers on the camera follows thing', () => {
    const { s } = sim(
      program({
        game: { width: 100, height: 50 },
        things: [thing('p', { look: look.box(10, 10), at: [[200, 100]], cameraFollows: true })],
        rules: [rule(when.always(), act.move('p', 'right', 2))],
      }),
    )
    expect([s.camera.x, s.camera.y]).toEqual([155, 80])
    s.tick()
    expect([s.camera.prevX, s.camera.x]).toEqual([155, 157])
  })

  it('creates from images with natural sizes and reports missing ones', async () => {
    const p = program({
      things: [
        thing('hero', {
          look: look.image('hero.png'),
          at: [[0, 0]],
          animations: [animation('walk', ['w1.png', 'w2.png'], 8)],
        }),
        thing('ghost', { look: look.image('nope.png'), at: [[0, 0]] }),
      ],
    })
    const s = await Simulation.create(p, {
      assets: new StaticAssetLoader({
        'hero.png': { width: 12, height: 20 },
        'w1.png': { width: 12, height: 20 },
        'w2.png': { width: 12, height: 20 },
      }),
    })
    expect(s.instancesOf('hero')[0]).toMatchObject({ width: 12, height: 20 })
    expect(s.instancesOf('ghost')[0]).toMatchObject({ width: 16, height: 16 })
    expect(s.errors).toHaveLength(1)
    expect(s.errors[0]).toMatchObject({ code: 'image-missing', message: 'I couldn\'t load the picture "nope.png".' })
  })

  it('size overrides look size', () => {
    const { s } = sim(program({ things: [thing('p', { look: look.circle(5), size: { w: 3, h: 4 }, at: [[0, 0]] })] }))
    expect(s.instancesOf('p')[0]).toMatchObject({ width: 3, height: 4 })
  })

  it('circle size is its diameter', () => {
    const { s } = sim(program({ things: [thing('p', { look: look.circle(5), at: [[0, 0]] })] }))
    expect(s.instancesOf('p')[0]).toMatchObject({ width: 10, height: 10 })
  })

  it('is deterministic for the same inputs and random source', () => {
    const p = program({
      vars: [variable('x')],
      things: [thing('coin')],
      rules: [rule(when.every(0.1), act.make('coin', random(num(0), num(100)), 0))],
    })
    let seed = 1
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const a = new Simulation(p, new Map(), { random: rng })
    ticks(a, 120)
    seed = 1
    const b = new Simulation(p, new Map(), { random: rng })
    ticks(b, 120)
    expect(a.instancesOf('coin').map((c) => c.x)).toEqual(b.instancesOf('coin').map((c) => c.x))
  })
})
