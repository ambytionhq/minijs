// Physics step. See docs/spec.md section 5.1 step 3.
//
// Per instance (not fixed): optional gravity, then move on x and push out of
// solids, then move on y and push out of solids. Fast movers are substepped so
// they cannot tunnel through thin walls.

/** @import { Catalog } from './catalog.js' */
import { EPSILON, MAX_SUBSTEPS } from './config.js'
/** @import { SpatialHash } from './spatial-hash.js' */
/** @import { World } from './world.js' */

/**
 * Strict overlap: true only when boxes penetrate deeper than EPSILON on both axes.
 * @param {number} ax
 * @param {number} ay
 * @param {number} aw
 * @param {number} ah
 * @param {number} bx
 * @param {number} by
 * @param {number} bw
 * @param {number} bh
 * @returns {boolean}
 */
export function overlapsStrict(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw - EPSILON && ax + aw > bx + EPSILON && ay < by + bh - EPSILON && ay + ah > by + EPSILON
}

/**
 * Inclusive overlap: edge contact (within EPSILON) counts. Used for `touches`.
 * @param {number} ax
 * @param {number} ay
 * @param {number} aw
 * @param {number} ah
 * @param {number} bx
 * @param {number} by
 * @param {number} bw
 * @param {number} bh
 * @returns {boolean}
 */
export function touchesInclusive(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax <= bx + bw + EPSILON && ax + aw + EPSILON >= bx && ay <= by + bh + EPSILON && ay + ah + EPSILON >= by
}

export class Physics {
  /** @type {Catalog} */
  catalog
  /** @type {SpatialHash} */
  hash

  /**
   * @param {Catalog} catalog
   * @param {SpatialHash} hash
   */
  constructor(catalog, hash) {
    this.catalog = catalog
    this.hash = hash
  }

  /**
   * @param {World} world
   * @param {number} gravity
   */
  step(world, gravity) {
    const types = this.catalog.types
    let solidCount = 0

    // Pass 1: reset ground flags, apply gravity, count solids.
    for (let t = 0; t < types.length; t++) {
      const type = types[t]
      const list = world.lists[t]
      const count = world.counts[t]
      const applyGravity = type.falls && !type.fixed && gravity !== 0
      for (let i = 0; i < count; i++) {
        const id = list[i]
        world.onGround[id] = 0
        if (applyGravity) world.vy[id] = world.vy[id] + gravity
      }
      if (type.solid) solidCount += count
    }

    // Pass 2: index solids by the box they sweep this tick, so candidates stay valid while they move.
    this.hash.clear(solidCount, world.capacity)
    if (solidCount > 0) {
      for (let t = 0; t < types.length; t++) {
        const type = types[t]
        if (!type.solid) continue
        const list = world.lists[t]
        const count = world.counts[t]
        for (let i = 0; i < count; i++) {
          const id = list[i]
          const dx = type.fixed ? world.mx[id] : world.vx[id] + world.mx[id]
          const dy = type.fixed ? world.my[id] : world.vy[id] + world.my[id]
          const x = world.x[id]
          const y = world.y[id]
          this.hash.insert(
            id,
            dx < 0 ? x + dx : x,
            dy < 0 ? y + dy : y,
            world.w[id] + Math.abs(dx),
            world.h[id] + Math.abs(dy),
          )
        }
      }
    }

    // Pass 3: integrate and resolve.
    for (let t = 0; t < types.length; t++) {
      const type = types[t]
      const list = world.lists[t]
      const count = world.counts[t]
      for (let i = 0; i < count; i++) {
        const id = list[i]
        if (type.fixed) {
          world.x[id] = world.x[id] + world.mx[id]
          world.y[id] = world.y[id] + world.my[id]
        } else {
          const dx = world.vx[id] + world.mx[id]
          const dy = world.vy[id] + world.my[id]
          if (type.solid && solidCount > 1) {
            if (dx !== 0) this.moveX(world, id, dx)
            if (dy !== 0) this.moveY(world, id, dy)
          } else {
            world.x[id] = world.x[id] + dx
            world.y[id] = world.y[id] + dy
          }
        }
        world.mx[id] = 0
        world.my[id] = 0
      }
    }
  }

  /**
   * @param {number} distance
   * @param {number} size
   * @returns {number}
   * @private
   */
  substeps(distance, size) {
    const limit = Math.max(1, size / 2)
    return Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(Math.abs(distance) / limit)))
  }

  /**
   * @param {World} world
   * @param {number} id
   * @param {number} dx
   * @private
   */
  moveX(world, id, dx) {
    const w = world.w[id]
    const h = world.h[id]
    const steps = this.substeps(dx, w)
    const part = dx / steps
    for (let s = 0; s < steps; s++) {
      const start = world.x[id]
      const y = world.y[id]
      let x = start + part
      const n = this.hash.query(x, y, w, h)
      let blocked = false
      for (let k = 0; k < n; k++) {
        const other = this.hash.results[k]
        if (other === id || world.alive[other] !== 1) continue
        const ox = world.x[other]
        const ow = world.w[other]
        if (!overlapsStrict(x, y, w, h, ox, world.y[other], ow, world.h[other])) continue
        blocked = true
        x = part > 0 ? Math.min(x, ox - w) : Math.max(x, ox + ow)
      }
      if (blocked) {
        // Never snap backwards past the start: an instance spawned inside a wall stays put.
        world.x[id] = part > 0 ? Math.max(x, start) : Math.min(x, start)
        world.vx[id] = 0
        return
      }
      world.x[id] = x
    }
  }

  /**
   * @param {World} world
   * @param {number} id
   * @param {number} dy
   * @private
   */
  moveY(world, id, dy) {
    const w = world.w[id]
    const h = world.h[id]
    const steps = this.substeps(dy, h)
    const part = dy / steps
    for (let s = 0; s < steps; s++) {
      const start = world.y[id]
      const x = world.x[id]
      let y = start + part
      const n = this.hash.query(x, y, w, h)
      let blocked = false
      for (let k = 0; k < n; k++) {
        const other = this.hash.results[k]
        if (other === id || world.alive[other] !== 1) continue
        const oy = world.y[other]
        const oh = world.h[other]
        if (!overlapsStrict(x, y, w, h, world.x[other], oy, world.w[other], oh)) continue
        blocked = true
        y = part > 0 ? Math.min(y, oy - h) : Math.max(y, oy + oh)
      }
      if (blocked) {
        world.y[id] = part > 0 ? Math.max(y, start) : Math.min(y, start)
        world.vy[id] = 0
        if (part > 0) world.onGround[id] = 1
        return
      }
      world.y[id] = y
    }
  }
}
