// Particles: lots of tiny things that fly, fade and vanish. They are only for looks,
// so they never touch rules or physics, and they use their own random numbers so
// adding a sparkle can't change how a game plays. Stored in plain number arrays with
// a fixed limit; when it is full, the oldest particle is reused.

/** @import { ParticleSettings } from '@minijs/lang' */
/** @import { Camera } from './lower/context.js' */
/** @import { Renderer } from './render/renderer.js' */
/** @import { World } from './world.js' */
import { TICKS_PER_SECOND } from './config.js'

export const MAX_PARTICLES = 6000
const MAX_EMITTERS = 256
const LUT_SIZE = 24
const DT = 1 / TICKS_PER_SECOND

const SHAPE_SQUARE = 0
const SHAPE_CIRCLE = 1
const SHAPE_SPARK = 2

const WHERE_THING = 0
const WHERE_POINT = 1
const WHERE_SCREEN = 2

/**
 * Turn any CSS color into red, green and blue. Null where there is no browser to ask.
 * @returns {((color: string) => [number, number, number] | null)}
 */
function colorReader() {
  if (typeof document === 'undefined') return () => null
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return () => null
  return (color) => {
    ctx.fillStyle = '#000000'
    ctx.fillStyle = color
    const value = /** @type {string} */ (ctx.fillStyle)
    if (value.startsWith('#')) {
      const n = Number.parseInt(value.slice(1), 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
    const m = value.match(/[\d.]+/g)
    return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : null
  }
}

/**
 * A ready-to-draw list of colors from birth to death.
 * @param {string[]} colors
 * @returns {string[]}
 */
export function colorRamp(colors) {
  const read = colorReader()
  const rgb = colors.map(read)
  if (colors.length === 0) return Array.from({ length: LUT_SIZE }, () => '#ffffff')
  return Array.from({ length: LUT_SIZE }, (_, i) => {
    const at = (i / (LUT_SIZE - 1)) * (colors.length - 1)
    const low = Math.floor(at)
    const high = Math.min(colors.length - 1, low + 1)
    const a = rgb[low]
    const b = rgb[high]
    if (!a || !b) return colors[Math.round(at)]
    const t = at - low
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
  })
}

/** @param {ParticleSettings} s */
function compileEffect(s) {
  return {
    settings: s,
    ramp: colorRamp(s.colors),
    shape: s.shape === 'circle' ? SHAPE_CIRCLE : s.shape === 'spark' ? SHAPE_SPARK : SHAPE_SQUARE,
    dragPerTick: (1 - Math.min(s.drag, 0.99)) ** DT,
    gravityPerTick: s.gravity * DT,
    baseAngle: (s.direction * Math.PI) / 180,
    spread: (s.spread * Math.PI) / 180,
    perTick: s.rate * DT,
  }
}

export class ParticleSystem {
  /** How many are alive. */
  count = 0
  next = 0
  x = new Float32Array(MAX_PARTICLES)
  y = new Float32Array(MAX_PARTICLES)
  vx = new Float32Array(MAX_PARTICLES)
  vy = new Float32Array(MAX_PARTICLES)
  age = new Float32Array(MAX_PARTICLES)
  life = new Float32Array(MAX_PARTICLES)
  sizeStart = new Float32Array(MAX_PARTICLES)
  sizeEnd = new Float32Array(MAX_PARTICLES)
  effect = new Int16Array(MAX_PARTICLES).fill(-1)

  emitterCount = 0
  emitterEffect = new Int16Array(MAX_EMITTERS)
  emitterWhere = new Uint8Array(MAX_EMITTERS)
  emitterId = new Int32Array(MAX_EMITTERS)
  emitterX = new Float64Array(MAX_EMITTERS)
  emitterY = new Float64Array(MAX_EMITTERS)
  emitterCarry = new Float64Array(MAX_EMITTERS)

  seed = 0x9e3779b9

  /** @param {ParticleSettings[]} effects */
  constructor(effects) {
    this.effects = effects.map(compileEffect)
  }

  /** Small fast random, from 0 up to 1. */
  random() {
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /**
   * @param {number} effectId
   * @param {number} x
   * @param {number} y
   */
  spawn(effectId, x, y) {
    const e = this.effects[effectId]
    const s = e.settings
    const i = this.next
    this.next = (i + 1) % MAX_PARTICLES
    if (this.effect[i] < 0) this.count++
    const angle = e.baseAngle + (this.random() - 0.5) * e.spread
    const speed = s.speed[0] + (s.speed[1] - s.speed[0]) * this.random()
    this.x[i] = x + (this.random() - 0.5) * s.area[0]
    this.y[i] = y + (this.random() - 0.5) * s.area[1]
    this.vx[i] = Math.cos(angle) * speed
    this.vy[i] = -Math.sin(angle) * speed
    this.age[i] = 0
    this.life[i] = Math.max(0.01, s.life[0] + (s.life[1] - s.life[0]) * this.random())
    this.sizeStart[i] = s.size[0]
    this.sizeEnd[i] = s.size[1]
    this.effect[i] = effectId
  }

  /**
   * One burst.
   * @param {number} effectId
   * @param {number} x
   * @param {number} y
   */
  burst(effectId, x, y) {
    const amount = this.effects[effectId].settings.amount
    for (let i = 0; i < amount; i++) this.spawn(effectId, x, y)
  }

  /**
   * Keep making particles. Starting the same effect on the same thing again does nothing.
   * @param {number} effectId
   * @param {number} where
   * @param {number} id instance, for `on a thing`
   * @param {number} x
   * @param {number} y
   */
  start(effectId, where, id, x, y) {
    for (let i = 0; i < this.emitterCount; i++) {
      if (this.emitterEffect[i] !== effectId || this.emitterWhere[i] !== where) continue
      if (where === WHERE_THING ? this.emitterId[i] === id : where === WHERE_SCREEN) return
      if (where === WHERE_POINT && this.emitterX[i] === x && this.emitterY[i] === y) return
    }
    if (this.emitterCount === MAX_EMITTERS) return
    const i = this.emitterCount++
    this.emitterEffect[i] = effectId
    this.emitterWhere[i] = where
    this.emitterId[i] = id
    this.emitterX[i] = x
    this.emitterY[i] = y
    this.emitterCarry[i] = 0
  }

  /**
   * Stop making particles. What is already flying finishes on its own.
   * @param {number} effectId
   * @param {number} id instance, or -1 for everywhere
   */
  stop(effectId, id) {
    let write = 0
    for (let read = 0; read < this.emitterCount; read++) {
      if (this.emitterEffect[read] === effectId && (id < 0 || (this.emitterWhere[read] === WHERE_THING && this.emitterId[read] === id))) continue
      this.copyEmitter(read, write)
      write++
    }
    this.emitterCount = write
  }

  /**
   * @param {number} from
   * @param {number} to
   * @private
   */
  copyEmitter(from, to) {
    if (from === to) return
    this.emitterEffect[to] = this.emitterEffect[from]
    this.emitterWhere[to] = this.emitterWhere[from]
    this.emitterId[to] = this.emitterId[from]
    this.emitterX[to] = this.emitterX[from]
    this.emitterY[to] = this.emitterY[from]
    this.emitterCarry[to] = this.emitterCarry[from]
  }

  /** Everything gone, for a restart. */
  clear() {
    this.count = 0
    this.next = 0
    this.effect.fill(-1)
    this.emitterCount = 0
  }

  /**
   * Advance one tick.
   * @param {World} world
   * @param {Camera} camera
   * @param {number} viewW
   * @param {number} viewH
   */
  step(world, camera, viewW, viewH) {
    let write = 0
    for (let i = 0; i < this.emitterCount; i++) {
      const where = this.emitterWhere[i]
      const id = this.emitterId[i]
      // A thing that is gone takes its emitter with it.
      if (where === WHERE_THING && world.alive[id] !== 1) continue
      const effectId = this.emitterEffect[i]
      const e = this.effects[effectId]
      let carry = this.emitterCarry[i] + e.perTick
      while (carry >= 1) {
        carry -= 1
        if (where === WHERE_THING) this.spawn(effectId, world.x[id] + world.w[id] / 2, world.y[id] + world.h[id] / 2)
        else if (where === WHERE_POINT) this.spawn(effectId, this.emitterX[i], this.emitterY[i])
        else this.spawn(effectId, camera.x + this.random() * viewW, camera.y - 2)
      }
      this.emitterCarry[i] = carry
      this.copyEmitter(i, write)
      write++
    }
    this.emitterCount = write

    if (this.count === 0) return
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const effectId = this.effect[i]
      if (effectId < 0) continue
      const age = this.age[i] + DT
      if (age >= this.life[i]) {
        this.effect[i] = -1
        this.count--
        continue
      }
      const e = this.effects[effectId]
      this.age[i] = age
      this.vx[i] = this.vx[i] * e.dragPerTick
      this.vy[i] = this.vy[i] * e.dragPerTick + e.gravityPerTick
      this.x[i] = this.x[i] + this.vx[i] * DT
      this.y[i] = this.y[i] + this.vy[i] * DT
    }
  }

  /**
   * @param {Renderer} renderer
   * @param {number} camX
   * @param {number} camY
   * @param {number} viewW
   * @param {number} viewH
   * @param {number} alpha how far into the next tick we are drawing
   */
  draw(renderer, camX, camY, viewW, viewH, alpha) {
    if (this.count === 0) return
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const effectId = this.effect[i]
      if (effectId < 0) continue
      const e = this.effects[effectId]
      const t = this.age[i] / this.life[i]
      const size = this.sizeStart[i] + (this.sizeEnd[i] - this.sizeStart[i]) * t
      if (size <= 0.01) continue
      const vx = this.vx[i]
      const vy = this.vy[i]
      const x = this.x[i] + vx * DT * alpha - camX
      const y = this.y[i] + vy * DT * alpha - camY
      if (x < -size || y < -size || x > viewW + size || y > viewH + size) continue
      const color = e.ramp[Math.min(LUT_SIZE - 1, Math.floor(t * LUT_SIZE))]
      const opacity = e.settings.fade ? Math.min(1, (1 - t) * 2) : 1
      renderer.particle(x, y, size, color, opacity, e.shape, e.settings.glow, vx * 0.03, vy * 0.03)
    }
  }
}

export const PARTICLE_SHAPE_IDS = { square: SHAPE_SQUARE, circle: SHAPE_CIRCLE, spark: SHAPE_SPARK }
export const EMIT_WHERE = { thing: WHERE_THING, point: WHERE_POINT, screen: WHERE_SCREEN }
