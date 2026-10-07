// Simulation: the headless heart of the engine. Owns world, variables, text,
// rules and physics, and advances exactly one fixed tick per tick() call.
// Has no knowledge of canvas, requestAnimationFrame, or the DOM.

/** @import { MiniError, Program } from '@minijs/lang' */
import { miniError } from '@minijs/lang'
/** @import { AssetLoader, LoadedImage } from './assets.js' */
import { loadImages, StaticAssetLoader } from './assets.js'
import { Catalog } from './catalog.js'
import { TouchIndex } from './collide.js'
import { CELL_SIZE } from './config.js'
import { ControlState } from './controls.js'
import { Input } from './input.js'
/** @import { Camera } from './lower/context.js' */
import { RuleContext } from './lower/context.js'
import { Physics } from './physics.js'
import { RuleSet } from './rules.js'
import { SpatialHash } from './spatial-hash.js'
import { TextLayer } from './text.js'
import { World } from './world.js'

/**
 * @typedef {object} SimulationOptions
 * @property {Input} [input]
 * @property {AssetLoader} [assets]
 * @property {() => number} [random] Random source in [0, 1). Defaults to Math.random. Inject for deterministic tests.
 * @property {(error: MiniError) => void} [onError]
 * @property {() => void} [onStop]
 * @property {(text: string, tick: number) => void} [onLog] Receives `log "..."` lines.
 */

/**
 * Plain snapshot of one instance, for tests and tools. Not used by the hot loop.
 * @typedef {object} InstanceView
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} width
 * @property {number} height
 * @property {boolean} onGround
 * @property {string | null} animation
 */

export class Simulation {
  /** @type {Program} */
  program
  /** @type {Catalog} */
  catalog
  /** @type {Input} */
  input
  text = new TextLayer()
  /** @type {Camera} */
  camera = { x: 0, y: 0, prevX: 0, prevY: 0 }
  /** @type {MiniError[]} */
  errors = []

  /** @type {World} */
  world
  /** @type {Float64Array} */
  vars
  /** Ticks since start or last restart. */
  tickCount = 0
  stopped = false

  /** @type {RuleSet} */
  rules
  /** @type {Physics} */
  physics
  /** @type {TouchIndex} */
  touches
  /** @type {RuleContext} */
  context
  /** @type {((error: MiniError) => void) | null} */
  onError
  /** @type {(() => void) | null} */
  onStop
  /** @type {((text: string, tick: number) => void) | null} */
  onLog
  /** @type {ControlState} */
  controls
  restartRequested = false
  stopRequested = false

  /**
   * Load assets, then build. Asset load errors are recorded, never thrown.
   * @param {Program} program
   * @param {SimulationOptions} [options={}]
   * @returns {Promise<Simulation>}
   */
  static async create(program, options = {}) {
    const loader = options.assets ?? new StaticAssetLoader()
    const { images, errors } = await loadImages(program, loader)
    const sim = new Simulation(program, images, options)
    for (const error of errors) sim.reportError(error)
    return sim
  }

  /**
   * Build synchronously from already-loaded images.
   * @param {Program} program
   * @param {ReadonlyMap<string, LoadedImage>} images
   * @param {SimulationOptions} [options={}]
   */
  constructor(program, images, options = {}) {
    this.program = program
    this.catalog = new Catalog(program, images)
    this.input = options.input ?? new Input()
    this.onError = options.onError ?? null
    this.onStop = options.onStop ?? null
    this.onLog = options.onLog ?? null
    this.controls = new ControlState(program.controls ?? [])
    this.world = new World(this.catalog)
    this.vars = new Float64Array(this.catalog.varInitial)
    this.touches = new TouchIndex(this.catalog)
    this.physics = new Physics(this.catalog, new SpatialHash(CELL_SIZE))
    this.context = new RuleContext({
      world: this.world,
      catalog: this.catalog,
      vars: this.vars,
      input: this.input,
      controls: this.controls,
      camera: this.camera,
      text: this.text,
      screenWidth: program.game.width,
      screenHeight: program.game.height,
      random: options.random ?? Math.random,
      control: {
        stop: () => {
          this.stopRequested = true
        },
        restart: () => {
          this.restartRequested = true
        },
        error: (error) => this.reportError(error),
        log: (text) => this.onLog?.(text, this.tickCount),
      },
    })
    this.rules = new RuleSet(program.rules, this.catalog, this.text, this.touches)
    this.populate()
  }

  /** Advance one fixed tick (1/60 s). Does nothing while stopped. */
  tick() {
    if (this.stopped) return
    const world = this.world
    const c = this.context

    this.input.snapshot()
    this.controls.update(this.input)
    world.prevX.set(world.x)
    world.prevY.set(world.y)
    this.camera.prevX = this.camera.x
    this.camera.prevY = this.camera.y
    c.tick = this.tickCount

    this.rules.runPre(c)
    this.physics.step(world, this.program.game.gravity)
    this.updateCamera()
    this.updateOffscreen()
    if (this.touches.active) this.touches.build(world)
    this.rules.runPost(c)

    if (!world.flush()) {
      this.reportError(
        miniError(
          'too-many-things',
          { line: 1, col: 1 },
          'There are too many things in the game at once, so I stopped it.',
          'Remove things when you are done with them, or make them less often.',
        ),
      )
      this.stopRequested = true
    }
    this.markSpawnedOffscreen()
    this.advanceAnimations()
    this.tickCount++

    if (this.restartRequested) {
      this.restart()
    } else if (this.stopRequested) {
      this.stopRequested = false
      this.stopped = true
      this.onStop?.()
    }
  }

  /** Reset to the start state: instances, variables, text, timers, condition edges. */
  restart() {
    this.restartRequested = false
    this.stopRequested = false
    this.stopped = false
    this.tickCount = 0
    this.world = new World(this.catalog)
    this.context.world = this.world
    this.vars.set(this.catalog.varInitial)
    this.text.clear()
    this.controls.reset()
    this.rules.reset()
    this.populate()
  }

  /** Request a stop from outside (e.g. a Stop button). */
  stop() {
    if (this.stopped) return
    this.stopped = true
    this.onStop?.()
  }

  /** @param {MiniError} error */
  reportError(error) {
    this.errors.push(error)
    this.onError?.(error)
  }

  /**
   * @param {string} name
   * @returns {number}
   */
  getVar(name) {
    return this.vars[this.catalog.varId(name)]
  }

  /**
   * Snapshot of all live instances of a thing, in creation order.
   * @param {string} name
   * @returns {InstanceView[]}
   */
  instancesOf(name) {
    const t = this.catalog.typeId(name)
    const type = this.catalog.types[t]
    const world = this.world
    /** @type {InstanceView[]} */
    const out = []
    for (let i = 0; i < world.counts[t]; i++) {
      const id = world.lists[t][i]
      const anim = world.anim[id]
      out.push({
        id,
        x: world.x[id],
        y: world.y[id],
        vx: world.vx[id],
        vy: world.vy[id],
        width: world.w[id],
        height: world.h[id],
        onGround: world.onGround[id] === 1,
        animation: anim >= 0 ? type.animations[anim].name : null,
      })
    }
    return out
  }

  /** @private */
  populate() {
    for (const type of this.catalog.types) {
      for (const start of type.decl.starts) this.world.spawn(type.id, start.x, start.y)
    }
    // Maps place their things after the `starts at` ones, row by row, left to right.
    for (const map of this.program.maps ?? []) {
      /** @type {Map<string, number>} */
      const letters = new Map(map.legend.map((e) => [e.char, this.catalog.typeId(e.thing)]))
      map.rows.forEach((row, r) => {
        let c = 0
        for (const ch of row.text) {
          const t = letters.get(ch)
          if (t !== undefined) this.world.spawn(t, map.x + c * map.tileW, map.y + r * map.tileH)
          c++
        }
      })
    }
    this.updateCamera()
    this.camera.prevX = this.camera.x
    this.camera.prevY = this.camera.y
    const world = this.world
    for (const t of this.catalog.leaveTypes) {
      for (let i = 0; i < world.counts[t]; i++) {
        const id = world.lists[t][i]
        world.offscreen[id] = this.isOutside(id) ? 1 : 0
      }
    }
  }

  /** @private */
  updateCamera() {
    const t = this.catalog.cameraType
    if (t < 0) return
    const id = this.world.first(t)
    if (id < 0) return
    const world = this.world
    this.camera.x = world.x[id] + world.w[id] / 2 - this.program.game.width / 2
    this.camera.y = world.y[id] + world.h[id] / 2 - this.program.game.height / 2
  }

  /**
   * @param {number} id
   * @returns {boolean}
   * @private
   */
  isOutside(id) {
    const world = this.world
    const left = this.camera.x
    const top = this.camera.y
    const x = world.x[id]
    const y = world.y[id]
    return (
      x + world.w[id] < left ||
      x > left + this.program.game.width ||
      y + world.h[id] < top ||
      y > top + this.program.game.height
    )
  }

  /** @private */
  updateOffscreen() {
    const world = this.world
    for (const t of this.catalog.leaveTypes) {
      const list = world.lists[t]
      const count = world.counts[t]
      for (let i = 0; i < count; i++) {
        const id = list[i]
        const outside = this.isOutside(id) ? 1 : 0
        world.leftScreen[id] = outside === 1 && world.offscreen[id] === 0 ? 1 : 0
        world.offscreen[id] = outside
      }
    }
  }

  /**
   * New instances start with their current on/off screen state, so spawning offscreen does not count as leaving.
   * @private
   */
  markSpawnedOffscreen() {
    const world = this.world
    for (let i = 0; i < world.spawnedCount; i++) {
      const id = world.spawned[i]
      world.offscreen[id] = this.isOutside(id) ? 1 : 0
    }
  }

  /** @private */
  advanceAnimations() {
    const world = this.world
    for (let t = 0; t < this.catalog.types.length; t++) {
      const list = world.lists[t]
      const count = world.counts[t]
      for (let i = 0; i < count; i++) {
        const id = list[i]
        if (world.anim[id] >= 0) world.animTicks[id] = world.animTicks[id] + 1
      }
    }
  }
}
