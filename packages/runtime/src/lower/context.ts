// RuleContext is the single mutable object every lowered closure receives.
// It holds the world, variables, input, camera, text, and instance bindings.

import type { MiniError } from '@minijs/lang'
import type { Catalog } from '../catalog.ts'
import type { Input } from '../input.ts'
import type { TextLayer } from '../text.ts'
import type { World } from '../world.ts'

export interface Camera {
  x: number
  y: number
  prevX: number
  prevY: number
}

export interface Control {
  stop(): void
  restart(): void
  error(error: MiniError): void
}

export type NumFn = (c: RuleContext) => number
export type BoolFn = (c: RuleContext) => boolean
export type ActionFn = (c: RuleContext) => void
export type InstanceFn = (c: RuleContext, id: number) => void

export class RuleContext {
  world: World
  vars: Float64Array
  tick = 0
  readonly catalog: Catalog
  readonly input: Input
  readonly camera: Camera
  readonly text: TextLayer
  readonly screenWidth: number
  readonly screenHeight: number
  readonly random: () => number
  readonly control: Control
  /** Per type: instance bound by the current trigger (touch, click on, leaves screen), or -1. */
  readonly bound: Int32Array
  /** Per type: instance an action is currently applied to, or -1. */
  readonly current: Int32Array

  constructor(options: {
    world: World
    catalog: Catalog
    vars: Float64Array
    input: Input
    camera: Camera
    text: TextLayer
    screenWidth: number
    screenHeight: number
    random: () => number
    control: Control
  }) {
    this.world = options.world
    this.catalog = options.catalog
    this.vars = options.vars
    this.input = options.input
    this.camera = options.camera
    this.text = options.text
    this.screenWidth = options.screenWidth
    this.screenHeight = options.screenHeight
    this.random = options.random
    this.control = options.control
    this.bound = new Int32Array(options.catalog.typeCount).fill(-1)
    this.current = new Int32Array(options.catalog.typeCount).fill(-1)
  }

  /** The instance a thing name refers to right now: bound, else current, else first live, else -1. */
  resolve(typeId: number): number {
    const bound = this.bound[typeId]!
    if (bound >= 0) return bound
    const current = this.current[typeId]!
    if (current >= 0) return current
    return this.world.first(typeId)
  }
}

/** Run `fn` on the bound instance of a type, or on every live instance when unbound. */
export function eachTarget(typeId: number, fn: InstanceFn): ActionFn {
  return (c) => {
    const bound = c.bound[typeId]!
    if (bound >= 0) {
      runOn(c, typeId, bound, fn)
      return
    }
    const world = c.world
    const list = world.lists[typeId]!
    const count = world.counts[typeId]!
    for (let i = 0; i < count; i++) {
      const id = list[i]!
      if (world.removing[id] === 0) runOn(c, typeId, id, fn)
    }
  }
}

function runOn(c: RuleContext, typeId: number, id: number, fn: InstanceFn): void {
  const previous = c.current[typeId]!
  c.current[typeId] = id
  fn(c, id)
  c.current[typeId] = previous
}
