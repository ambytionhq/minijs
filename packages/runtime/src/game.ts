// start(): wires a Simulation to a canvas, browser input, and the frame loop.

import type { MiniError, Program } from '@minijs/lang'
import { BrowserAssetLoader, type AssetLoader } from './assets.ts'
import { BrowserInput } from './input.ts'
import { FixedLoop, type FrameScheduler, browserScheduler } from './loop.ts'
import { Canvas2DRenderer } from './render/canvas2d.ts'
import { drawWorld } from './render/draw-world.ts'
import { Simulation } from './simulation.ts'

export interface StartOptions {
  /** Base URL for image paths. Ignored when `assets` is given. */
  assetsBase?: string
  assets?: AssetLoader
  /** Fit the canvas to its parent element and follow resizes. Default true. */
  fit?: boolean
  random?: () => number
  scheduler?: FrameScheduler
}

export type GameEvent = 'error' | 'stop'

type Listener<E extends GameEvent> = E extends 'error' ? (error: MiniError) => void : () => void

export class Game {
  simulation!: Simulation

  private readonly canvas: HTMLCanvasElement
  private readonly options: StartOptions
  private readonly input = new BrowserInput()
  private readonly loop: FixedLoop
  private readonly errorListeners = new Set<(error: MiniError) => void>()
  private readonly stopListeners = new Set<() => void>()
  private readonly allErrors: MiniError[] = []
  private renderer!: Canvas2DRenderer
  private resizeObserver: ResizeObserver | null = null
  private destroyed = false

  private constructor(canvas: HTMLCanvasElement, options: StartOptions) {
    this.canvas = canvas
    this.options = options
    this.loop = new FixedLoop(
      {
        tick: () => this.simulation.tick(),
        render: (alpha) => drawWorld(this.renderer, this.simulation, alpha),
      },
      options.scheduler ?? browserScheduler,
    )
  }

  /** Load the program's images, then start the loop. Prefer the `start()` function. */
  static async start(program: Program, canvas: HTMLCanvasElement, options: StartOptions = {}): Promise<Game> {
    const game = new Game(canvas, options)
    game.simulation = await game.createSimulation(program)
    game.renderer = game.createRenderer(program)
    game.attach()
    return game
  }

  /** Subscribe. 'error' listeners receive earlier errors immediately. Returns an unsubscribe function. */
  on<E extends GameEvent>(event: E, listener: Listener<E>): () => void {
    if (event === 'error') {
      const fn = listener as (error: MiniError) => void
      this.errorListeners.add(fn)
      for (const error of this.allErrors) fn(error)
      return () => this.errorListeners.delete(fn)
    }
    const fn = listener as () => void
    this.stopListeners.add(fn)
    return () => this.stopListeners.delete(fn)
  }

  get errors(): readonly MiniError[] {
    return this.allErrors
  }

  /** Swap in a new program and start from its beginning. */
  async reload(program: Program): Promise<void> {
    const simulation = await this.createSimulation(program)
    if (this.destroyed) return
    this.simulation = simulation
    this.input.detach()
    this.renderer = this.createRenderer(program)
    this.attach()
  }

  /** Freeze the simulation. Drawing continues so the last frame stays visible. */
  stop(): void {
    this.simulation.stop()
  }

  /** Stop everything and release listeners. The canvas keeps its last frame. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.loop.stop()
    this.input.detach()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.errorListeners.clear()
    this.stopListeners.clear()
  }

  private attach(): void {
    const { width, height } = this.simulation.program.game
    this.input.attach(window, this.canvas, width, height)
    this.fitToParent()
    this.loop.start()
  }

  private createSimulation(program: Program): Promise<Simulation> {
    return Simulation.create(program, {
      input: this.input,
      assets: this.options.assets ?? new BrowserAssetLoader(this.options.assetsBase ?? ''),
      random: this.options.random,
      onError: (error) => this.emitError(error),
      onStop: () => {
        for (const fn of this.stopListeners) fn()
      },
    })
  }

  private emitError(error: MiniError): void {
    this.allErrors.push(error)
    for (const fn of this.errorListeners) fn(error)
  }

  private createRenderer(program: Program): Canvas2DRenderer {
    const { width, height, pixelArt } = program.game
    return new Canvas2DRenderer(this.canvas, width, height, pixelArt)
  }

  private fitToParent(): void {
    if (this.options.fit === false) {
      const { width, height } = this.simulation.program.game
      this.renderer.resize(width, height, window.devicePixelRatio || 1)
      return
    }
    const parent = this.canvas.parentElement
    if (!parent) return
    const apply = () => {
      const rect = parent.getBoundingClientRect()
      this.renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1)
    }
    apply()
    if (this.resizeObserver === null && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(apply)
      this.resizeObserver.observe(parent)
    }
  }
}

/** Start a program on a canvas. Resolves once all images are loaded and the loop is running. */
export function start(program: Program, canvas: HTMLCanvasElement, options: StartOptions = {}): Promise<Game> {
  return Game.start(program, canvas, options)
}
