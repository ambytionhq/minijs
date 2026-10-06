// Catalog: static, resolved facts about a program. Thing types get numeric ids,
// variables get slots, looks get ids. Built once per Simulation; never mutated
// during ticks.

import type { Look, Program, ThingDecl } from '@minijs/lang'
import type { LoadedImage } from './assets.ts'
import { PLACEHOLDER_SIZE } from './config.ts'

export interface ResolvedLook {
  kind: 'box' | 'circle' | 'image'
  color: string
  /** Set for image looks. */
  image: LoadedImage | null
}

export interface ResolvedAnimation {
  name: string
  frames: LoadedImage[]
  fps: number
}

export interface ThingType {
  id: number
  name: string
  decl: ThingDecl
  width: number
  height: number
  baseLook: number
  solid: boolean
  fixed: boolean
  falls: boolean
  animations: ResolvedAnimation[]
  animationIds: ReadonlyMap<string, number>
}

/** Thrown when a program references names that were never declared. lang's checker prevents this. */
export class ProgramShapeError extends Error {
  override name = 'ProgramShapeError'
}

function imageFor(images: ReadonlyMap<string, LoadedImage>, src: string): LoadedImage {
  return (
    images.get(src) ?? { src, width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, source: null, missing: true }
  )
}

function lookSize(look: Look, images: ReadonlyMap<string, LoadedImage>): { w: number; h: number } {
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
  readonly program: Program
  readonly types: ThingType[] = []
  readonly looks: ResolvedLook[] = []
  readonly varNames: string[] = []
  readonly varInitial: Float64Array
  /** Type id of the `camera follows` thing, or -1. */
  readonly cameraType: number
  /** Types that appear in any `touches` rule. */
  readonly touchTypes: ReadonlySet<number>
  /** Types that appear in any `leaves the screen` rule. */
  readonly leaveTypes: ReadonlySet<number>

  private readonly typeIds = new Map<string, number>()
  private readonly varIds = new Map<string, number>()
  private readonly lookIds = new Map<Look, number>()
  private readonly images: ReadonlyMap<string, LoadedImage>

  constructor(program: Program, images: ReadonlyMap<string, LoadedImage>) {
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

    const touchTypes = new Set<number>()
    const leaveTypes = new Set<number>()
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

  get typeCount(): number {
    return this.types.length
  }

  typeId(name: string): number {
    const id = this.typeIds.get(name)
    if (id === undefined) throw new ProgramShapeError(`Unknown thing "${name}"`)
    return id
  }

  varId(name: string): number {
    const id = this.varIds.get(name)
    if (id === undefined) throw new ProgramShapeError(`Unknown variable "${name}"`)
    return id
  }

  animationId(typeId: number, name: string): number {
    const id = this.types[typeId]!.animationIds.get(name)
    if (id === undefined) {
      throw new ProgramShapeError(`Thing "${this.types[typeId]!.name}" has no animation "${name}"`)
    }
    return id
  }

  /** Look id for a Look node registered at construction (base looks and changeLook targets). */
  lookId(look: Look): number {
    const id = this.lookIds.get(look)
    if (id === undefined) throw new ProgramShapeError('Look was not registered in the catalog')
    return id
  }

  private registerLook(look: Look): number {
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
