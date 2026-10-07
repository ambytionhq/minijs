// Touch detection for `<a> touches <b>` rules. Built after physics each tick
// from instances of types that appear in touch rules only.

/** @import { Catalog } from './catalog.js' */
/** @import { RuleContext } from './lower/context.js' */
import { touchesInclusive } from './physics.js'
import { SpatialHash } from './spatial-hash.js'
/** @import { World } from './world.js' */

/** @typedef {(c: RuleContext, idA: number, idB: number) => void} PairHandler */

export class TouchIndex {
  hash = new SpatialHash()
  /** @type {number[]} */
  typeIds

  /** @param {Catalog} catalog */
  constructor(catalog) {
    this.typeIds = [...catalog.touchTypes].sort((a, b) => a - b)
  }

  get active() {
    return this.typeIds.length > 0
  }

  /** @param {World} world */
  build(world) {
    let total = 0
    for (const t of this.typeIds) total += world.counts[t]
    this.hash.clear(total, world.capacity)
    for (const t of this.typeIds) {
      const list = world.lists[t]
      const count = world.counts[t]
      for (let i = 0; i < count; i++) {
        const id = list[i]
        this.hash.insert(id, world.x[id], world.y[id], world.w[id], world.h[id])
      }
    }
  }

  /**
   * Call `handler(c, idA, idB)` for every touching pair where idA is of type
   * `a` and idB of type `b`. The smaller type list drives the queries.
   * Instances queued for removal are skipped, so one coin is collected once.
   * For a == b each unordered pair is reported once.
   * @param {RuleContext} c
   * @param {number} a
   * @param {number} b
   * @param {PairHandler} handler
   */
  forEachPair(c, a, b, handler) {
    const world = c.world
    const swap = a !== b && world.counts[b] < world.counts[a]
    const outerType = swap ? b : a
    const innerType = swap ? a : b
    const list = world.lists[outerType]
    const count = world.counts[outerType]
    const hash = this.hash
    for (let i = 0; i < count; i++) {
      const outer = list[i]
      if (world.removing[outer] === 1) continue
      const ox = world.x[outer]
      const oy = world.y[outer]
      const ow = world.w[outer]
      const oh = world.h[outer]
      const n = hash.query(ox - 1, oy - 1, ow + 2, oh + 2)
      for (let k = 0; k < n; k++) {
        const inner = hash.results[k]
        if (inner === outer || world.type[inner] !== innerType || world.removing[inner] === 1) continue
        if (a === b && inner < outer) continue
        if (!touchesInclusive(ox, oy, ow, oh, world.x[inner], world.y[inner], world.w[inner], world.h[inner])) continue
        if (swap) handler(c, inner, outer)
        else handler(c, outer, inner)
        if (world.removing[outer] === 1) break
      }
    }
  }
}
