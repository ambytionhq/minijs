// Simulation: the headless heart of the engine. Owns world, variables, text,
// rules and physics, and advances exactly one fixed tick per tick() call.
// Has no knowledge of canvas, requestAnimationFrame, or the DOM.

import { miniError, type MiniError, type Program } from '@minijs/lang'
import { loadImages, StaticAssetLoader, type AssetLoader, type LoadedImage } from './assets.ts'
import { Catalog } from './catalog.ts'
import { TouchIndex } from './collide.ts'
import { CELL_SIZE } from './config.ts'
import { Input } from './input.ts'
import { RuleContext, type Camera } from './lower/context.ts'
import { Physics } from './physics.ts'
import { RuleSet } from './rules.ts'
import { SpatialHash } from './spatial-hash.ts'
import { TextLayer } from './text.ts'
import { World } from './world.ts'

export interface SimulationOptions {
  input?: Input
  assets?: AssetLoader
  /** Random source in [0, 1). Defaults to Math.random. Inject for deterministic tests. */
  random?: () => number
  onError?: (error: MiniError) => void
  onStop?: () => void
}

/** Plain snapshot of one instance, for tests and tools. Not used by the hot loop. */
export interface InstanceView {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  width: number
  height: number
  onGround: boolean
  animation: string | null
}

export class Simulation {
  readonly program: Program
  readonly catalog: Catalog
  readonly input: Input
  readonly text = new TextLayer()
  readonly camera: Camera = { x: 0, y: 0, prevX: 0, prevY: 0 }
  readonly errors: MiniError[] = []

  world: World
  vars: Float64Array
  /** Ticks since start or last restart. */
  tickCount = 0
  stopped = false

  private readonly rules: RuleSet
  private readonly physics: Physics
  private readonly touches: TouchIndex
  private readonly context: RuleContext
  private readonly onError: ((error: MiniError) => void) | null
  private readonly onStop: (() => void) | null
  private restartRequested = false
  private stopRequested = false

  /** Load assets, then build. Asset load errors are recorded, never thrown. */
  static async create(program: Program, options: SimulationOptions = {}): Promise<Simulation> {
    const loader = options.assets ?? new StaticAssetLoader()
    const { images, errors } = await loadImages(program, loader)
    const sim = new Simulation(program, images, options)
    for (const error of errors) sim.reportError(error)
    return sim
  }

  /** Build synchronously from already-loaded images. */
  constructor(program: Program, images: ReadonlyMap<string, LoadedImage>, options: SimulationOptions = {}) {
    this.program = program
    this.catalog = new Catalog(program, images)
    this.input = options.input ?? new Input()
    this.onError = options.onError ?? null
    this.onStop = options.onStop ?? null
    this.world = new World(this.catalog)
    this.vars = new Float64Array(this.catalog.varInitial)
    this.touches = new TouchIndex(this.catalog)
    this.physics = new Physics(this.catalog, new SpatialHash(CELL_SIZE))
    this.context = new RuleContext({
      world: this.world,
      catalog: this.catalog,
      vars: this.vars,
      input: this.input,
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
      },
    })
    this.rules = new RuleSet(program.rules, this.catalog, this.text, this.touches)
    this.populate()
  }

  /** Advance one fixed tick (1/60 s). Does nothing while stopped. */
  tick(): void {
    if (this.stopped) return
    const world = this.world
    const c = this.context

    this.input.snapshot()
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
  restart(): void {
    this.restartRequested = false
    this.stopRequested = false
    this.stopped = false
    this.tickCount = 0
    this.world = new World(this.catalog)
    this.context.world = this.world
    this.vars.set(this.catalog.varInitial)
    this.text.clear()
    this.rules.reset()
    this.populate()
  }

  /** Request a stop from outside (e.g. a Stop button). */
  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.onStop?.()
  }

  reportError(error: MiniError): void {
    this.errors.push(error)
    this.onError?.(error)
  }

  getVar(name: string): number {
    return this.vars[this.catalog.varId(name)]!
  }

  /** Snapshot of all live instances of a thing, in creation order. */
  instancesOf(name: string): InstanceView[] {
    const t = this.catalog.typeId(name)
    const type = this.catalog.types[t]!
    const world = this.world
    const out: InstanceView[] = []
    for (let i = 0; i < world.counts[t]!; i++) {
      const id = world.lists[t]![i]!
      const anim = world.anim[id]!
      out.push({
        id,
        x: world.x[id]!,
        y: world.y[id]!,
        vx: world.vx[id]!,
        vy: world.vy[id]!,
        width: world.w[id]!,
        height: world.h[id]!,
        onGround: world.onGround[id] === 1,
        animation: anim >= 0 ? type.animations[anim]!.name : null,
      })
    }
    return out
  }

  private populate(): void {
    for (const type of this.catalog.types) {
      for (const start of type.decl.starts) this.world.spawn(type.id, start.x, start.y)
    }
    this.updateCamera()
    this.camera.prevX = this.camera.x
    this.camera.prevY = this.camera.y
    const world = this.world
    for (const t of this.catalog.leaveTypes) {
      for (let i = 0; i < world.counts[t]!; i++) {
        const id = world.lists[t]![i]!
        world.offscreen[id] = this.isOutside(id) ? 1 : 0
      }
    }
  }

  private updateCamera(): void {
    const t = this.catalog.cameraType
    if (t < 0) return
    const id = this.world.first(t)
    if (id < 0) return
    const world = this.world
    this.camera.x = world.x[id]! + world.w[id]! / 2 - this.program.game.width / 2
    this.camera.y = world.y[id]! + world.h[id]! / 2 - this.program.game.height / 2
  }

  private isOutside(id: number): boolean {
    const world = this.world
    const left = this.camera.x
    const top = this.camera.y
    const x = world.x[id]!
    const y = world.y[id]!
    return (
      x + world.w[id]! < left ||
      x > left + this.program.game.width ||
      y + world.h[id]! < top ||
      y > top + this.program.game.height
    )
  }

  private updateOffscreen(): void {
    const world = this.world
    for (const t of this.catalog.leaveTypes) {
      const list = world.lists[t]!
      const count = world.counts[t]!
      for (let i = 0; i < count; i++) {
        const id = list[i]!
        const outside = this.isOutside(id) ? 1 : 0
        world.leftScreen[id] = outside === 1 && world.offscreen[id] === 0 ? 1 : 0
        world.offscreen[id] = outside
      }
    }
  }

  /** New instances start with their current on/off screen state, so spawning offscreen does not count as leaving. */
  private markSpawnedOffscreen(): void {
    const world = this.world
    for (let i = 0; i < world.spawnedCount; i++) {
      const id = world.spawned[i]!
      world.offscreen[id] = this.isOutside(id) ? 1 : 0
    }
  }

  private advanceAnimations(): void {
    const world = this.world
    for (let t = 0; t < this.catalog.types.length; t++) {
      const list = world.lists[t]!
      const count = world.counts[t]!
      for (let i = 0; i < count; i++) {
        const id = list[i]!
        if (world.anim[id]! >= 0) world.animTicks[id] = world.animTicks[id]! + 1
      }
    }
  }
}
