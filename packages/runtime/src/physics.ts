// Physics step. See docs/spec.md section 5.1 step 3.
//
// Per instance (not fixed): optional gravity, then move on x and push out of
// solids, then move on y and push out of solids. Fast movers are substepped so
// they cannot tunnel through thin walls.

import type { Catalog } from './catalog.ts'
import { EPSILON, MAX_SUBSTEPS } from './config.ts'
import type { SpatialHash } from './spatial-hash.ts'
import type { World } from './world.ts'

/** Strict overlap: true only when boxes penetrate deeper than EPSILON on both axes. */
export function overlapsStrict(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw - EPSILON && ax + aw > bx + EPSILON && ay < by + bh - EPSILON && ay + ah > by + EPSILON
}

/** Inclusive overlap: edge contact (within EPSILON) counts. Used for `touches`. */
export function touchesInclusive(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax <= bx + bw + EPSILON && ax + aw + EPSILON >= bx && ay <= by + bh + EPSILON && ay + ah + EPSILON >= by
}

export class Physics {
  private readonly catalog: Catalog
  private readonly hash: SpatialHash

  constructor(catalog: Catalog, hash: SpatialHash) {
    this.catalog = catalog
    this.hash = hash
  }

  step(world: World, gravity: number): void {
    const types = this.catalog.types
    let solidCount = 0

    // Pass 1: reset ground flags, apply gravity, count solids.
    for (let t = 0; t < types.length; t++) {
      const type = types[t]!
      const list = world.lists[t]!
      const count = world.counts[t]!
      const applyGravity = type.falls && !type.fixed && gravity !== 0
      for (let i = 0; i < count; i++) {
        const id = list[i]!
        world.onGround[id] = 0
        if (applyGravity) world.vy[id] = world.vy[id]! + gravity
      }
      if (type.solid) solidCount += count
    }

    // Pass 2: index solids by the box they sweep this tick, so candidates stay valid while they move.
    this.hash.clear(solidCount, world.capacity)
    if (solidCount > 0) {
      for (let t = 0; t < types.length; t++) {
        const type = types[t]!
        if (!type.solid) continue
        const list = world.lists[t]!
        const count = world.counts[t]!
        for (let i = 0; i < count; i++) {
          const id = list[i]!
          const dx = type.fixed ? world.mx[id]! : world.vx[id]! + world.mx[id]!
          const dy = type.fixed ? world.my[id]! : world.vy[id]! + world.my[id]!
          const x = world.x[id]!
          const y = world.y[id]!
          this.hash.insert(
            id,
            dx < 0 ? x + dx : x,
            dy < 0 ? y + dy : y,
            world.w[id]! + Math.abs(dx),
            world.h[id]! + Math.abs(dy),
          )
        }
      }
    }

    // Pass 3: integrate and resolve.
    for (let t = 0; t < types.length; t++) {
      const type = types[t]!
      const list = world.lists[t]!
      const count = world.counts[t]!
      for (let i = 0; i < count; i++) {
        const id = list[i]!
        if (type.fixed) {
          world.x[id] = world.x[id]! + world.mx[id]!
          world.y[id] = world.y[id]! + world.my[id]!
        } else {
          const dx = world.vx[id]! + world.mx[id]!
          const dy = world.vy[id]! + world.my[id]!
          if (type.solid && solidCount > 1) {
            if (dx !== 0) this.moveX(world, id, dx)
            if (dy !== 0) this.moveY(world, id, dy)
          } else {
            world.x[id] = world.x[id]! + dx
            world.y[id] = world.y[id]! + dy
          }
        }
        world.mx[id] = 0
        world.my[id] = 0
      }
    }
  }

  private substeps(distance: number, size: number): number {
    const limit = Math.max(1, size / 2)
    return Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(Math.abs(distance) / limit)))
  }

  private moveX(world: World, id: number, dx: number): void {
    const w = world.w[id]!
    const h = world.h[id]!
    const steps = this.substeps(dx, w)
    const part = dx / steps
    for (let s = 0; s < steps; s++) {
      const start = world.x[id]!
      const y = world.y[id]!
      let x = start + part
      const n = this.hash.query(x, y, w, h)
      let blocked = false
      for (let k = 0; k < n; k++) {
        const other = this.hash.results[k]!
        if (other === id || world.alive[other] !== 1) continue
        const ox = world.x[other]!
        const ow = world.w[other]!
        if (!overlapsStrict(x, y, w, h, ox, world.y[other]!, ow, world.h[other]!)) continue
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

  private moveY(world: World, id: number, dy: number): void {
    const w = world.w[id]!
    const h = world.h[id]!
    const steps = this.substeps(dy, h)
    const part = dy / steps
    for (let s = 0; s < steps; s++) {
      const start = world.y[id]!
      const x = world.x[id]!
      let y = start + part
      const n = this.hash.query(x, y, w, h)
      let blocked = false
      for (let k = 0; k < n; k++) {
        const other = this.hash.results[k]!
        if (other === id || world.alive[other] !== 1) continue
        const oy = world.y[other]!
        const oh = world.h[other]!
        if (!overlapsStrict(x, y, w, h, world.x[other]!, oy, world.w[other]!, oh)) continue
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
