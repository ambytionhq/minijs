import { describe, expect, it } from 'vitest'
import { ManualInput, keyIndex } from '../src/input.js'

describe('Input edges', () => {
  const left = keyIndex('left')

  it('reports pressed once, then held, then released', () => {
    const input = new ManualInput()
    input.keyDown('left')
    input.snapshot()
    expect([input.isPressed(left), input.isHeld(left), input.isReleased(left)]).toEqual([true, true, false])
    input.snapshot()
    expect([input.isPressed(left), input.isHeld(left), input.isReleased(left)]).toEqual([false, true, false])
    input.keyUp('left')
    input.snapshot()
    expect([input.isPressed(left), input.isHeld(left), input.isReleased(left)]).toEqual([false, false, true])
    input.snapshot()
    expect([input.isPressed(left), input.isHeld(left), input.isReleased(left)]).toEqual([false, false, false])
  })

  it('does not lose a tap shorter than one tick', () => {
    const input = new ManualInput()
    input.tap('left')
    input.snapshot()
    expect([input.isPressed(left), input.isHeld(left), input.isReleased(left)]).toEqual([true, true, true])
  })

  it('ignores key repeat', () => {
    const input = new ManualInput()
    input.keyDown('left')
    input.snapshot()
    input.keyDown('left')
    input.snapshot()
    expect(input.isPressed(left)).toBe(false)
  })

  it('latches clicks and pointer position', () => {
    const input = new ManualInput()
    input.click(12, 34)
    input.snapshot()
    expect(input.isClicked()).toBe(true)
    expect([input.mouseX, input.mouseY]).toEqual([12, 34])
    input.snapshot()
    expect(input.isClicked()).toBe(false)
  })

  it('releaseAll releases held keys', () => {
    const input = new ManualInput()
    input.keyDown('left')
    input.snapshot()
    input.releaseAll()
    input.snapshot()
    expect(input.isHeld(left)).toBe(false)
    expect(input.isReleased(left)).toBe(true)
  })
})
