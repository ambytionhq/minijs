// RuleContext is the single mutable object every lowered closure receives.
// It holds the world, variables, input, camera, text, and instance bindings.

/** @import { MiniError } from '@minijs/lang' */
/** @import { Catalog } from '../catalog.js' */
/** @import { Input } from '../input.js' */
/** @import { ControlState } from '../controls.js' */
/** @import { TextLayer } from '../text.js' */
/** @import { World } from '../world.js' */

/**
 * @typedef {object} Camera
 * @property {number} x
 * @property {number} y
 * @property {number} prevX
 * @property {number} prevY
 */

/**
 * @typedef {object} Control
 * @property {() => void} stop
 * @property {() => void} restart
 * @property {(error: MiniError) => void} error
 * @property {(text: string) => void} log
 */

/** @typedef {(c: RuleContext) => number} NumFn */
/** @typedef {(c: RuleContext) => boolean} BoolFn */
/** @typedef {(c: RuleContext) => void} ActionFn */
/** @typedef {(c: RuleContext, id: number) => void} InstanceFn */

export class RuleContext {
  /** @type {World} */
  world
  /** @type {Float64Array} */
  vars
  tick = 0
  /** @type {Catalog} */
  catalog
  /** @type {Input} */
  input
  /** @type {ControlState} */
  controls
  /** @type {Camera} */
  camera
  /** @type {TextLayer} */
  text
  /** @type {number} */
  screenWidth
  /** @type {number} */
  screenHeight
  /** @type {() => number} */
  random
  /** @type {Control} */
  control
  /**
   * Per type: instance bound by the current trigger (touch, click on, leaves screen), or -1.
   * @type {Int32Array}
   */
  bound
  /**
   * Per type: instance an action is currently applied to, or -1.
   * @type {Int32Array}
   */
  current

  /** @param {{ world: World; catalog: Catalog; vars: Float64Array; input: Input; controls: ControlState; camera: Camera; text: TextLayer; screenWidth: number; screenHeight: number; random: () => number; control: Control }} options */
  constructor(options) {
    this.world = options.world
    this.catalog = options.catalog
    this.vars = options.vars
    this.input = options.input
    this.controls = options.controls
    this.camera = options.camera
    this.text = options.text
    this.screenWidth = options.screenWidth
    this.screenHeight = options.screenHeight
    this.random = options.random
    this.control = options.control
    this.bound = new Int32Array(options.catalog.typeCount).fill(-1)
    this.current = new Int32Array(options.catalog.typeCount).fill(-1)
  }

  /**
   * The instance a thing name refers to right now: bound, else current, else first live, else -1.
   * @param {number} typeId
   * @returns {number}
   */
  resolve(typeId) {
    const bound = this.bound[typeId]
    if (bound >= 0) return bound
    const current = this.current[typeId]
    if (current >= 0) return current
    return this.world.first(typeId)
  }
}

/**
 * Run `fn` on the bound instance of a type, or on every live instance when unbound.
 * @param {number} typeId
 * @param {InstanceFn} fn
 * @returns {ActionFn}
 */
export function eachTarget(typeId, fn) {
  return (c) => {
    const bound = c.bound[typeId]
    if (bound >= 0) {
      runOn(c, typeId, bound, fn)
      return
    }
    const world = c.world
    const list = world.lists[typeId]
    const count = world.counts[typeId]
    for (let i = 0; i < count; i++) {
      const id = list[i]
      if (world.removing[id] === 0) runOn(c, typeId, id, fn)
    }
  }
}

/**
 * @param {RuleContext} c
 * @param {number} typeId
 * @param {number} id
 * @param {InstanceFn} fn
 */
function runOn(c, typeId, id, fn) {
  const previous = c.current[typeId]
  c.current[typeId] = id
  fn(c, id)
  c.current[typeId] = previous
}

/**
 * Live instance of a type under the pointer (world coordinates), or -1.
 * @param {RuleContext} c
 * @param {number} typeId
 * @returns {number}
 */
export function instanceUnderPointer(c, typeId) {
  const px = c.input.mouseX + c.camera.x
  const py = c.input.mouseY + c.camera.y
  const world = c.world
  const list = world.lists[typeId]
  const count = world.counts[typeId]
  for (let i = 0; i < count; i++) {
    const id = list[i]
    if (world.removing[id] === 1) continue
    const x = world.x[id]
    const y = world.y[id]
    if (px >= x && px <= x + world.w[id] && py >= y && py <= y + world.h[id]) return id
  }
  return -1
}
