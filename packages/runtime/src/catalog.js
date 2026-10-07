// Catalog: static, resolved facts about a program. Thing types get numeric ids,
// variables get slots, looks get ids. Built once per Simulation; never mutated
// during ticks.

/** @import { Look, Program, ThingDecl } from '@minijs/lang' */
/** @import { LoadedImage } from './assets.js' */
import { PLACEHOLDER_SIZE } from './config.js'

/**
 * @typedef {object} ResolvedLook
 * @property {'box' | 'circle' | 'image'} kind
 * @property {string} color
 * @property {LoadedImage | null} image Set for image looks.
 */

/**
 * @typedef {object} ResolvedAnimation
 * @property {string} name
 * @property {LoadedImage[]} frames
 * @property {number} fps
 */

/**
 * @typedef {object} ThingType
 * @property {number} id
 * @property {string} name
 * @property {ThingDecl} decl
 * @property {number} width
 * @property {number} height
 * @property {number} baseLook
 * @property {boolean} solid
 * @property {boolean} fixed
 * @property {boolean} falls
 * @property {ResolvedAnimation[]} animations
 * @property {ReadonlyMap<string, number>} animationIds
 */

/** Thrown when a program references names that were never declared. lang's checker prevents this. */
export class ProgramShapeError extends Error {
  name = 'ProgramShapeError'
}

/**
 * @param {ReadonlyMap<string, LoadedImage>} images
 * @param {string} src
 * @returns {LoadedImage}
 */
function imageFor(images, src) {
  return images.get(src) ?? { src, width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, source: null, missing: true }
}

/**
 * @param {Look} look
 * @param {ReadonlyMap<string, LoadedImage>} images
 * @returns {{ w: number; h: number }}
 */
function lookSize(look, images) {
  switch (look.kind) {
    case 'box':
      return { w: look.w, h: look.h }
    case 'circle':
      return { w: look.r * 2, h: look.r * 2 }
    case 'image': {
      const image = imageFor(images, look.src)
      return { w: image.width, h: image.height }
    }
  }
}

export class Catalog {
  /** @type {Program} */
  program
  /** @type {ThingType[]} */
  types = []
  /** @type {ResolvedLook[]} */
  looks = []
  /** @type {string[]} */
  varNames = []
  /** @type {Float64Array} */
  varInitial
  /**
   * Type id of the `camera follows` thing, or -1.
   * @type {number}
   */
  cameraType
  /**
   * Types that appear in any `touches` rule.
   * @type {ReadonlySet<number>}
   */
  touchTypes
  /**
   * Types that appear in any `leaves the screen` rule.
   * @type {ReadonlySet<number>}
   */
  leaveTypes

  typeIds = new Map()
  varIds = new Map()
  lookIds = new Map()
  /** @type {ReadonlyMap<string, LoadedImage>} */
  images

  /**
   * @param {Program} program
   * @param {ReadonlyMap<string, LoadedImage>} images
   */
  constructor(program, images) {
    this.program = program
    this.images = images

    program.vars.forEach((v, i) => {
      this.varIds.set(v.name, i)
      this.varNames.push(v.name)
    })
    this.varInitial = Float64Array.from(program.vars, (v) => v.initial)

    let cameraType = -1
    program.things.forEach((decl, id) => {
      const size = decl.size ?? lookSize(decl.look, images)
      const animations = decl.animations.map((a) => ({
        name: a.name,
        frames: a.frames.map((src) => imageFor(images, src)),
        fps: a.fps,
      }))
      this.typeIds.set(decl.name, id)
      this.types.push({
        id,
        name: decl.name,
        decl,
        width: size.w,
        height: size.h,
        baseLook: this.registerLook(decl.look),
        solid: decl.solid,
        fixed: decl.fixed,
        falls: decl.falls,
        animations,
        animationIds: new Map(animations.map((a, i) => [a.name, i])),
      })
      if (decl.cameraFollows && cameraType === -1) cameraType = id
    })
    this.cameraType = cameraType

    const touchTypes = new Set()
    const leaveTypes = new Set()
    for (const rule of program.rules) {
      for (const action of rule.actions) {
        if (action.kind === 'changeLook') this.registerLook(action.look)
      }
      if (rule.trigger.kind === 'touch') {
        touchTypes.add(this.typeId(rule.trigger.a))
        touchTypes.add(this.typeId(rule.trigger.b))
      }
      if (rule.trigger.kind === 'leavesScreen') leaveTypes.add(this.typeId(rule.trigger.thing))
    }
    this.touchTypes = touchTypes
    this.leaveTypes = leaveTypes
  }

  get typeCount() {
    return this.types.length
  }

  /**
   * @param {string} name
   * @returns {number}
   */
  typeId(name) {
    const id = this.typeIds.get(name)
    if (id === undefined) throw new ProgramShapeError(`Unknown thing "${name}"`)
    return id
  }

  /**
   * @param {string} name
   * @returns {number}
   */
  varId(name) {
    const id = this.varIds.get(name)
    if (id === undefined) throw new ProgramShapeError(`Unknown variable "${name}"`)
    return id
  }

  /**
   * @param {number} typeId
   * @param {string} name
   * @returns {number}
   */
  animationId(typeId, name) {
    const id = this.types[typeId].animationIds.get(name)
    if (id === undefined) {
      throw new ProgramShapeError(`Thing "${this.types[typeId].name}" has no animation "${name}"`)
    }
    return id
  }

  /**
   * Look id for a Look node registered at construction (base looks and changeLook targets).
   * @param {Look} look
   * @returns {number}
   */
  lookId(look) {
    const id = this.lookIds.get(look)
    if (id === undefined) throw new ProgramShapeError('Look was not registered in the catalog')
    return id
  }

  /**
   * @param {Look} look
   * @returns {number}
   * @private
   */
  registerLook(look) {
    const existing = this.lookIds.get(look)
    if (existing !== undefined) return existing
    const id = this.looks.length
    this.looks.push({
      kind: look.kind,
      color: look.kind === 'image' ? '' : look.color,
      image: look.kind === 'image' ? imageFor(this.images, look.src) : null,
    })
    this.lookIds.set(look, id)
    return id
  }
}
