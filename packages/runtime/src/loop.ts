// Fixed-timestep loop. Logic ticks at TICKS_PER_SECOND; rendering happens once
// per animation frame with alpha = leftover fraction of a tick, for smooth
// motion on high refresh displays. Slow devices drop render frames and, past
// MAX_STEPS_PER_FRAME, drop time instead of spiralling.

import { MAX_FRAME_MS, MAX_STEPS_PER_FRAME, TICK_MS } from './config.ts'

export interface LoopHooks {
  tick(): void
  render(alpha: number): void
}

export interface FrameScheduler {
  request(callback: (time: number) => void): number
  cancel(handle: number): void
}

export const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
}

export class FixedLoop {
  private readonly hooks: LoopHooks
  private readonly scheduler: FrameScheduler
  private accumulator = 0
  private last = -1
  private handle = -1
  private running = false

  constructor(hooks: LoopHooks, scheduler: FrameScheduler = browserScheduler) {
    this.hooks = hooks
    this.scheduler = scheduler
  }

  get isRunning(): boolean {
    return this.running
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = -1
    this.accumulator = 0
    this.handle = this.scheduler.request(this.onFrame)
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.scheduler.cancel(this.handle)
    this.handle = -1
  }

  /**
   * Advance by one frame at timestamp `time` (ms). Public so tests can drive
   * the loop with a fake clock. Returns the number of ticks run.
   */
  frame(time: number): number {
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

  private readonly onFrame = (time: number): void => {
    if (!this.running) return
    this.frame(time)
    this.handle = this.scheduler.request(this.onFrame)
  }
}
