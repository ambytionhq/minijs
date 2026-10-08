import { describe, expect, it } from 'vitest'
import { MAX_STEPS_PER_FRAME, TICK_MS } from '../src/config.js'
/** @import { FrameScheduler } from '../src/loop.js' */
import { FixedLoop } from '../src/loop.js'

function harness() {
  let ticks = 0
  /** @type {number[]} */
  const alphas = []
  /** @type {Array<(t: number) => void>} */
  const callbacks = []
  /** @type {FrameScheduler} */
  const scheduler = {
    request: (cb) => callbacks.push(cb),
    cancel: () => {},
  }
  const loop = new FixedLoop({ tick: () => ticks++, render: (a) => alphas.push(a) }, scheduler)
  return { loop, alphas, callbacks, ticks: () => ticks }
}

describe('FixedLoop', () => {
  it('runs one tick per tick interval', () => {
    const h = harness()
    h.loop.frame(0)
    expect(h.ticks()).toBe(0)
    h.loop.frame(TICK_MS)
    expect(h.ticks()).toBe(1)
    h.loop.frame(TICK_MS * 4)
    expect(h.ticks()).toBe(4)
  })

  it('renders with interpolation alpha on fast displays', () => {
    const h = harness()
    h.loop.frame(0)
    h.loop.frame(TICK_MS / 2)
    expect(h.ticks()).toBe(0)
    expect(h.alphas.at(-1)).toBeCloseTo(0.5)
  })

  it('caps catch-up steps and drops excess time', () => {
    const h = harness()
    h.loop.frame(0)
    const steps = h.loop.frame(200)
    expect(steps).toBe(MAX_STEPS_PER_FRAME)
    expect(h.alphas.at(-1)).toBe(0)
  })

  it('clamps huge gaps such as a hidden tab', () => {
    const h = harness()
    h.loop.frame(0)
    expect(h.loop.frame(60_000)).toBe(MAX_STEPS_PER_FRAME)
  })

  it('schedules frames while running and stops cleanly', () => {
    const h = harness()
    h.loop.start()
    expect(h.callbacks.length).toBe(1)
    h.callbacks[0](0)
    expect(h.callbacks.length).toBe(2)
    h.loop.stop()
    h.callbacks[1](TICK_MS)
    expect(h.ticks()).toBe(0)
    expect(h.callbacks.length).toBe(2)
  })

  it('does not schedule another frame when the game stops during rendering', () => {
    const h = harness()
    h.loop.hooks.render = () => h.loop.stop()
    h.loop.start()
    h.callbacks[0](0)
    expect(h.loop.isRunning).toBe(false)
    expect(h.callbacks.length).toBe(1)
  })
})
