// Fixed-timestep loop. Logic ticks at TICKS_PER_SECOND; rendering happens once
// per animation frame with alpha = leftover fraction of a tick, for smooth
// motion on high refresh displays. Slow devices drop render frames and, past
// MAX_STEPS_PER_FRAME, drop time instead of spiralling.

import { MAX_FRAME_MS, MAX_STEPS_PER_FRAME, TICK_MS } from './config.js'

/**
 * @typedef {object} LoopHooks
 * @property {() => void} tick
 * @property {(alpha: number) => void} render
 */

/**
 * @typedef {object} FrameScheduler
 * @property {(callback: (time: number) => void) => number} request
 * @property {(handle: number) => void} cancel
 */

/** @type {FrameScheduler} */
export const browserScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
}

export class FixedLoop {
  /** @type {LoopHooks} */
  hooks
  /** @type {FrameScheduler} */
  scheduler
  accumulator = 0
  last = -1
  handle = -1
  running = false

  /**
   * @param {LoopHooks} hooks
   * @param {FrameScheduler} [scheduler=browserScheduler]
   */
  constructor(hooks, scheduler = browserScheduler) {
    this.hooks = hooks
    this.scheduler = scheduler
  }

  get isRunning() {
    return this.running
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = -1
    this.accumulator = 0
    this.handle = this.scheduler.request(this.onFrame)
  }

  stop() {
    if (!this.running) return
    this.running = false
    this.scheduler.cancel(this.handle)
    this.handle = -1
  }

  /**
   * Advance by one frame at timestamp `time` (ms). Public so tests can drive
   * the loop with a fake clock. Returns the number of ticks run.
   * @param {number} time
   * @returns {number}
   */
  frame(time) {
    if (this.last < 0) this.last = time
    const elapsed = Math.min(Math.max(0, time - this.last), MAX_FRAME_MS)
    this.last = time
    this.accumulator += elapsed

    // Tolerance absorbs float drift so a frame landing exactly on a tick boundary still ticks.
    const threshold = TICK_MS - 1e-6
    let steps = 0
    while (this.accumulator >= threshold && steps < MAX_STEPS_PER_FRAME) {
      this.hooks.tick()
      this.accumulator = Math.max(0, this.accumulator - TICK_MS)
      steps++
    }
    if (this.accumulator >= threshold) this.accumulator = 0

    this.hooks.render(this.accumulator / TICK_MS)
    return steps
  }

  onFrame = (time) => {
    if (!this.running) return
    this.frame(time)
    if (this.running) this.handle = this.scheduler.request(this.onFrame)
  }
}
