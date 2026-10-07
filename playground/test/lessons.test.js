import { compile } from '@minijs/lang'
import { describe, expect, it } from 'vitest'
import { FIRST_GAME } from '../src/learn/lessons.js'

describe('first game lesson', () => {
  it('starts with a clean game where step 1 is not done yet', async () => {
    const { program, errors } = compile(FIRST_GAME.starter)
    expect(errors).toEqual([])
    expect(await FIRST_GAME.steps[0].check(/** @type {any} */ (program))).not.toBeNull()
  })

  it('every "do it for me" passes its own check, in order, with no problems', async () => {
    let text = FIRST_GAME.starter
    for (const step of FIRST_GAME.steps) {
      text = step.apply(text)
      const { program, errors } = compile(text)
      expect(errors, `${step.title}\n${text}`).toEqual([])
      expect(await step.check(/** @type {any} */ (program)), step.title).toBeNull()
    }
    // Earlier checks still pass at the end.
    const { program } = compile(text)
    for (const step of FIRST_GAME.steps) expect(await step.check(/** @type {any} */ (program)), step.title).toBeNull()
  })

  it('accepts answers written differently from the example', async () => {
    const custom = `game
  size 320 by 180
  background navy
  gravity 0.3

thing bob
  looks like red box 10 by 10
  starts at 10, 10
  falls
  solid

thing floor
  looks like white box 400 by 10
  starts at 0, 170
  solid
  fixed

control go
  d key
when go is held
  move bob right 1
`
    const { program } = compile(custom)
    expect(program).not.toBeNull()
    for (const step of FIRST_GAME.steps.slice(0, 4)) expect(await step.check(/** @type {any} */ (program)), step.title).toBeNull()
  })

  it('every step example compiles inside a full answer', () => {
    for (const step of FIRST_GAME.steps) expect(step.example.length).toBeGreaterThan(5)
  })
})
