// Catalog: static, resolved facts about a program. Thing types get numeric ids,
// variables get slots, looks get ids. Built once per Simulation; never mutated
// during ticks.

/** @import { Look, Program, ThingDecl, MiniError } from '@minijs/lang' */
/** @import { LoadedImage } from './assets.js' */
/** @import { GameData } from './game-data.js' */
import { allRules, didYouMean, miniError } from '@minijs/lang'
import { PLACEHOLDER_SIZE } from './config.js'
import { emptyGameData } from './game-data.js'

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

/**
 * One tile from any tile set the game uses, ready to draw and check.
 * @typedef {object} TileEntry
 * @property {string} name
 * @property {number} nameId Tiles with the same name share this, across tile sets.
 * @property {'plain' | 'terrain'} kind
 * @property {number} solid 0 open, 1 solid, 2 platform.
 * @property {number} fps
 * @property {HTMLCanvasElement | OffscreenCanvas | null} atlas
 * @property {Array<{ x: number; y: number }>} spots
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
  controlIds = new Map()
  lookIds = new Map()
  /** @type {ReadonlyMap<string, LoadedImage>} */
  images
  /** @type {GameData} */
  data
  /** Every tile of every tile set in use. @type {TileEntry[]} */
  tileTable = []
  /** @type {Map<string, number>} */
  tileNameIds = new Map()
  soundNames = new Set()
  musicNames = new Set()
  /** @type {Map<string, number>} */
  particleIds = new Map()
  /** Problems found while reading rules that only show up with the files loaded. @type {MiniError[]} */
  problems = []

  /**
   * @param {Program} program
   * @param {ReadonlyMap<string, LoadedImage>} images
   * @param {GameData} [data]
   */
  constructor(program, images, data = emptyGameData()) {
    this.program = program
    this.images = images
    this.data = data
    for (const { tileset, atlas } of data.tilesets) {
      tileset.tiles.forEach((tile, i) => {
        let nameId = this.tileNameIds.get(tile.name)
        if (nameId === undefined) {
          nameId = this.tileNameIds.size
          this.tileNameIds.set(tile.name, nameId)
        }
        this.tileTable.push({
          name: tile.name,
          nameId,
          kind: tile.kind,
          solid: tile.solid === 'solid' ? 1 : tile.solid === 'top' ? 2 : 0,
          fps: tile.fps,
          atlas: atlas.source,
          spots: atlas.frames[i],
        })
      })
    }
    ;[...data.particles.keys()].forEach((name, i) => this.particleIds.set(name, i))

    program.vars.forEach((v, i) => {
      this.varIds.set(v.name, i)
      this.varNames.push(v.name)
    })
    this.varInitial = Float64Array.from(program.vars, (v) => v.initial)
    ;(program.controls ?? []).forEach((ctl, i) => this.controlIds.set(ctl.name, i))

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
    for (const rule of allRules(program)) {
      for (const action of rule.actions) {
        if (action.kind === 'changeLook') this.registerLook(action.look)
      }
      if (rule.trigger?.kind === 'touch') {
        touchTypes.add(this.typeId(rule.trigger.a))
        touchTypes.add(this.typeId(rule.trigger.b))
      }
      if (rule.trigger?.kind === 'leavesScreen') leaveTypes.add(this.typeId(rule.trigger.thing))
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
   * Name id for a tile a rule mentions. Unknown names get one clear message, and never match anything.
   * @param {string} name
   * @param {import('@minijs/lang').Loc} loc
   * @returns {number}
   */
  tileNameId(name, loc) {
    const id = this.tileNameIds.get(name)
    if (id !== undefined) return id
    // A missing file already has its own message; don't pile on.
    const everyMapLoaded = (this.program.tilemaps ?? []).every((m) => this.data.tilemaps.has(m.name))
    if (everyMapLoaded) {
      this.problems.push(
        miniError(
          'unknown-tile',
          loc,
          `I don't know a tile called "${name}".`,
          didYouMean(name, this.tileNameIds.keys()) ??
            (this.tileNameIds.size > 0
              ? `Tiles in this game: ${[...this.tileNameIds.keys()].slice(0, 12).join(', ')}.`
              : 'Add a tile map with a line like: tilemap level "level.tilemap"'),
        ),
      )
    }
    return -2
  }

  /**
   * Which `states` block belongs to a thing (or the game, for null). -1 when there is none.
   * @param {string | null} thing
   * @returns {number}
   */
  machineIndex(thing) {
    return (this.program.machines ?? []).findIndex((m) => m.thing === thing)
  }

  /**
   * @param {string | null} thing
   * @param {string} state
   * @returns {number}
   */
  stateId(thing, state) {
    const m = this.machineIndex(thing)
    const id = m < 0 ? -1 : this.program.machines[m].states.findIndex((s) => s.name === state)
    if (id < 0) throw new ProgramShapeError(`Unknown state "${state}"`)
    return id
  }

  /**
   * @param {string} name
   * @returns {number}
   */
  controlId(name) {
    const id = this.controlIds.get(name)
    if (id === undefined) throw new ProgramShapeError(`Unknown control "${name}"`)
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
