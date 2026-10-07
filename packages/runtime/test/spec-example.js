// The docs/spec.md section 7 example, built by hand. Stage 2's compile() must
// produce an equivalent Program (modulo locs); see integration.test.js.

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
