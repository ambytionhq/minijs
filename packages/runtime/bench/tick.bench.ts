// Perf budget (docs/spec.md section 3.8): 2,000 moving things with a touch
// rule and solids. Target: mean tick under 4 ms on a mid laptop.

import { bench, describe } from 'vitest'
import { ManualInput } from '../src/input.ts'
import { Simulation } from '../src/simulation.ts'
import { act, look, program, rule, thing, variable, when } from '../test/build.ts'

function arena(count: number) {
  const starts: Array<[number, number]> = []
  let seed = 7
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < count; i++) starts.push([Math.floor(rng() * 1800) + 60, Math.floor(rng() * 900) + 60])
  const p = program({
    game: { width: 1920, height: 1080, gravity: 0.2 },
    vars: [variable('hits')],
    things: [
      thing('ball', { look: look.box(6, 6), at: starts, solid: true, falls: true }),
      thing('floor', { look: look.box(1920, 40), at: [[0, 1040]], solid: true, fixed: true }),
      thing('wall', { look: look.box(40, 1080), at: [[0, 0], [1880, 0]], solid: true, fixed: true }),
      thing('zone', { look: look.box(300, 300), at: [[800, 400]] }),
    ],
    rules: [
      rule(when.every(0.5), act.push('ball', 'up', 6), act.push('ball', 'right', 1)),
      rule(when.always(), act.move('ball', 'left', 0.5)),
      rule(when.touch('zone', 'ball'), act.add(1, 'hits')),
    ],
  })
  const s = new Simulation(p, new Map(), { input: new ManualInput(), random: rng })
  for (let i = 0; i < 120; i++) s.tick()
  return s
}

describe('tick', () => {
  const big = arena(2000)
  bench('2,000 solid falling things + touch rule', () => {
    big.tick()
  })

  const small = arena(200)
  bench('200 solid falling things + touch rule', () => {
    small.tick()
  })
})
