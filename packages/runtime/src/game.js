// start(): wires a Simulation to a canvas, browser input, and the frame loop.

/** @import { MiniError, Program } from '@minijs/lang' */
/** @import { AssetLoader } from './assets.js' */
import { BrowserAssetLoader } from './assets.js'
import { BrowserInput } from './input.js'
/** @import { FrameScheduler } from './loop.js' */
import { FixedLoop, browserScheduler } from './loop.js'
import { Canvas2DRenderer } from './render/canvas2d.js'
import { drawWorld } from './render/draw-world.js'
import { Simulation } from './simulation.js'

/**
 * @typedef {object} StartOptions
 * @property {string} [assetsBase] Base URL for image paths. Ignored when `assets` is given.
 * @property {AssetLoader} [assets]
 * @property {boolean} [fit] Fit the canvas to its parent element and follow resizes. Default true.
 * @property {() => number} [random]
 * @property {FrameScheduler} [scheduler]
 */

/** @typedef {'error' | 'stop'} GameEvent */

/**
 * @template E extends GameEvent
 * @typedef {E extends 'error' ? (error: MiniError) => void : () => void} Listener
 */

export class Game {
  /** @type {Simulation} */
  simulation

  /** @type {HTMLCanvasElement} */
  canvas
  /** @type {StartOptions} */
  options
  input = new BrowserInput()
  /** @type {FixedLoop} */
  loop
  errorListeners = new Set()
  stopListeners = new Set()
  /** @type {MiniError[]} */
  allErrors = []
  /** @type {Canvas2DRenderer} */
  renderer
  /** @type {ResizeObserver | null} */
  resizeObserver = null
  destroyed = false

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {StartOptions} options
   */
  constructor(canvas, options) {
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

  /**
   * Load the program's images, then start the loop. Prefer the `start()` function.
   * @param {Program} program
   * @param {HTMLCanvasElement} canvas
   * @param {StartOptions} [options={}]
   * @returns {Promise<Game>}
   */
  static async start(program, canvas, options = {}) {
    const game = new Game(canvas, options)
    game.simulation = await game.createSimulation(program)
    game.renderer = game.createRenderer(program)
    game.attach()
    return game
  }

  /**
   * Subscribe. 'error' listeners receive earlier errors immediately. Returns an unsubscribe function.
   * @template E extends GameEvent
   * @param {E} event
   * @param {Listener<E>} listener
   * @returns {() => void}
   */
  on(event, listener) {
    if (event === 'error') {
      const fn = listener
      this.errorListeners.add(fn)
      for (const error of this.allErrors) fn(error)
      return () => this.errorListeners.delete(fn)
    }
    const fn = listener
    this.stopListeners.add(fn)
    return () => this.stopListeners.delete(fn)
  }

  get errors() {
    return this.allErrors
  }

  /**
   * Swap in a new program and start from its beginning.
   * @param {Program} program
   * @returns {Promise<void>}
   */
  async reload(program) {
    const simulation = await this.createSimulation(program)
    if (this.destroyed) return
    this.simulation = simulation
    this.input.detach()
    this.renderer = this.createRenderer(program)
    this.attach()
  }

  /** Freeze the simulation. Drawing continues so the last frame stays visible. */
  stop() {
    this.simulation.stop()
  }

  /** Stop everything and release listeners. The canvas keeps its last frame. */
  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.loop.stop()
    this.input.detach()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.errorListeners.clear()
    this.stopListeners.clear()
  }

  /** @private */
  attach() {
    const { width, height } = this.simulation.program.game
    this.input.attach(window, this.canvas, width, height)
    this.fitToParent()
    this.loop.start()
  }

  /**
   * @param {Program} program
   * @returns {Promise<Simulation>}
   * @private
   */
  createSimulation(program) {
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

  /**
   * @param {MiniError} error
   * @private
   */
  emitError(error) {
    this.allErrors.push(error)
    for (const fn of this.errorListeners) fn(error)
  }

  /**
   * @param {Program} program
   * @returns {Canvas2DRenderer}
   * @private
   */
  createRenderer(program) {
    const { width, height, pixelArt } = program.game
    return new Canvas2DRenderer(this.canvas, width, height, pixelArt)
  }

  /** @private */
  fitToParent() {
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

/**
 * Start a program on a canvas. Resolves once all images are loaded and the loop is running.
 * @param {Program} program
 * @param {HTMLCanvasElement} canvas
 * @param {StartOptions} [options={}]
 * @returns {Promise<Game>}
 */
export function start(program, canvas, options = {}) {
  return Game.start(program, canvas, options)
}
