// World: struct-of-arrays instance storage. Ids are slot indexes and get
// reused after removal. Per-type id lists keep creation order, which is the
// order physics, rules and drawing visit instances.
//
// Spawns and removals requested during a tick are queued and applied by
// flush(), so iteration never sees the world change under it.

/** @import { Catalog } from './catalog.js' */
import { INITIAL_CAPACITY, MAX_INSTANCES } from './config.js'

/**
 * @param {Float64Array} a
 * @param {number} size
 * @returns {Float64Array}
 */
function growF64(a, size) {
  const b = new Float64Array(size)
  b.set(a)
  return b
}

/**
 * @param {Int32Array} a
 * @param {number} size
 * @returns {Int32Array}
 */
function growI32(a, size, fill = 0) {
  const b = new Int32Array(size)
  if (fill !== 0) b.fill(fill)
  b.set(a)
  return b
}

/**
 * @param {Uint8Array} a
 * @param {number} size
 * @returns {Uint8Array}
 */
function growU8(a, size) {
  const b = new Uint8Array(size)
  b.set(a)
  return b
}

export class World {
  /** @type {number} */
  capacity
  /** Number of live instances. */
  liveCount = 0

  /** @type {Float64Array} */
  x
  /** @type {Float64Array} */
  y
  /** @type {Float64Array} */
  prevX
  /** @type {Float64Array} */
  prevY
  /** @type {Float64Array} */
  vx
  /** @type {Float64Array} */
  vy
  /**
   * `move` displacement accumulated this tick.
   * @type {Float64Array}
   */
  mx
  /** @type {Float64Array} */
  my
  /** @type {Float64Array} */
  w
  /** @type {Float64Array} */
  h
  /** @type {Int32Array} */
  type
  /** @type {Int32Array} */
  look
  /**
   * Playing animation index, or -1.
   * @type {Int32Array}
   */
  anim
  /** @type {Int32Array} */
  animTicks
  /** @type {Uint8Array} */
  alive
  /** @type {Uint8Array} */
  removing
  /** @type {Uint8Array} */
  onGround
  /** @type {Uint8Array} */
  offscreen
  /**
   * 1 on the tick an instance went fully outside the camera view.
   * @type {Uint8Array}
   */
  leftScreen

  /**
   * Per type: live ids in creation order. Only the first `counts[t]` entries are valid.
   * @type {Int32Array[]}
   */
  lists
  /** @type {Int32Array} */
  counts

  /**
   * Ids created by the last flush().
   * @type {Int32Array}
   */
  spawned
  spawnedCount = 0

  /** @type {Catalog} */
  catalog
  /** @type {Int32Array} */
  freeIds
  freeCount = 0
  nextId = 0

  /** @type {Float64Array} */
  spawnQueue
  spawnQueueCount = 0
  /** @type {Int32Array} */
  removeQueue
  removeQueueCount = 0
  /** @type {Uint8Array} */
  dirtyTypes

  /** @param {Catalog} catalog */
  constructor(catalog, capacity = INITIAL_CAPACITY) {
    this.catalog = catalog
    this.capacity = capacity
    this.x = new Float64Array(capacity)
    this.y = new Float64Array(capacity)
    this.prevX = new Float64Array(capacity)
    this.prevY = new Float64Array(capacity)
    this.vx = new Float64Array(capacity)
    this.vy = new Float64Array(capacity)
    this.mx = new Float64Array(capacity)
    this.my = new Float64Array(capacity)
    this.w = new Float64Array(capacity)
    this.h = new Float64Array(capacity)
    this.type = new Int32Array(capacity)
    this.look = new Int32Array(capacity)
    this.anim = new Int32Array(capacity).fill(-1)
    this.animTicks = new Int32Array(capacity)
    this.alive = new Uint8Array(capacity)
    this.removing = new Uint8Array(capacity)
    this.onGround = new Uint8Array(capacity)
    this.offscreen = new Uint8Array(capacity)
    this.leftScreen = new Uint8Array(capacity)
    this.freeIds = new Int32Array(capacity)
    this.spawned = new Int32Array(64)
    this.spawnQueue = new Float64Array(64 * 3)
    this.removeQueue = new Int32Array(64)
    this.lists = catalog.types.map(() => new Int32Array(16))
    this.counts = new Int32Array(catalog.typeCount)
    this.dirtyTypes = new Uint8Array(catalog.typeCount)
  }

  /**
   * Create an instance immediately. Returns its id, or -1 when the cap is reached.
   * @param {number} typeId
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  spawn(typeId, x, y) {
    if (this.liveCount >= MAX_INSTANCES) return -1
    const id = this.allocateId()
    const t = this.catalog.types[typeId]
    this.x[id] = x
    this.y[id] = y
    this.prevX[id] = x
    this.prevY[id] = y
    this.vx[id] = 0
    this.vy[id] = 0
    this.mx[id] = 0
    this.my[id] = 0
    this.w[id] = t.width
    this.h[id] = t.height
    this.type[id] = typeId
    this.look[id] = t.baseLook
    this.anim[id] = -1
    this.animTicks[id] = 0
    this.alive[id] = 1
    this.removing[id] = 0
    this.onGround[id] = 0
    this.offscreen[id] = 0
    this.leftScreen[id] = 0
    this.liveCount++

    let list = this.lists[typeId]
    const count = this.counts[typeId]
    if (count === list.length) {
      list = growI32(list, list.length * 2)
      this.lists[typeId] = list
    }
    list[count] = id
    this.counts[typeId] = count + 1
    return id
  }

  /**
   * @param {number} typeId
   * @param {number} x
   * @param {number} y
   */
  queueSpawn(typeId, x, y) {
    if (this.spawnQueueCount * 3 === this.spawnQueue.length) {
      this.spawnQueue = growF64(this.spawnQueue, this.spawnQueue.length * 2)
    }
    const at = this.spawnQueueCount * 3
    this.spawnQueue[at] = typeId
    this.spawnQueue[at + 1] = x
    this.spawnQueue[at + 2] = y
    this.spawnQueueCount++
  }

  /** @param {number} id */
  queueRemove(id) {
    if (this.alive[id] !== 1 || this.removing[id] === 1) return
    this.removing[id] = 1
    if (this.removeQueueCount === this.removeQueue.length) {
      this.removeQueue = growI32(this.removeQueue, this.removeQueue.length * 2)
    }
    this.removeQueue[this.removeQueueCount++] = id
  }

  /**
   * Apply queued removals, then queued spawns. Returns false if a spawn was
   * refused because the instance cap was reached.
   * @returns {boolean}
   */
  flush() {
    for (let i = 0; i < this.removeQueueCount; i++) {
      const id = this.removeQueue[i]
      this.alive[id] = 0
      this.removing[id] = 0
      this.dirtyTypes[this.type[id]] = 1
      this.freeIds[this.freeCount++] = id
      this.liveCount--
    }
    if (this.removeQueueCount > 0) {
      this.removeQueueCount = 0
      this.compactDirtyLists()
    }

    let ok = true
    this.spawnedCount = 0
    for (let i = 0; i < this.spawnQueueCount; i++) {
      const at = i * 3
      const id = this.spawn(this.spawnQueue[at], this.spawnQueue[at + 1], this.spawnQueue[at + 2])
      if (id === -1) {
        ok = false
        break
      }
      if (this.spawnedCount === this.spawned.length) this.spawned = growI32(this.spawned, this.spawned.length * 2)
      this.spawned[this.spawnedCount++] = id
    }
    this.spawnQueueCount = 0
    return ok
  }

  /**
   * First live instance of a type, or -1.
   * @param {number} typeId
   * @returns {number}
   */
  first(typeId) {
    return this.counts[typeId] > 0 ? this.lists[typeId][0] : -1
  }

  /** @private */
  compactDirtyLists() {
    for (let t = 0; t < this.dirtyTypes.length; t++) {
      if (this.dirtyTypes[t] === 0) continue
      this.dirtyTypes[t] = 0
      const list = this.lists[t]
      const count = this.counts[t]
      let write = 0
      for (let read = 0; read < count; read++) {
        const id = list[read]
        if (this.alive[id] === 1) list[write++] = id
      }
      this.counts[t] = write
    }
  }

  /**
   * @returns {number}
   * @private
   */
  allocateId() {
    if (this.freeCount > 0) return this.freeIds[--this.freeCount]
    if (this.nextId === this.capacity) this.grow(this.capacity * 2)
    return this.nextId++
  }

  /**
   * @param {number} size
   * @private
   */
  grow(size) {
    this.capacity = size
    this.x = growF64(this.x, size)
    this.y = growF64(this.y, size)
    this.prevX = growF64(this.prevX, size)
    this.prevY = growF64(this.prevY, size)
    this.vx = growF64(this.vx, size)
    this.vy = growF64(this.vy, size)
    this.mx = growF64(this.mx, size)
    this.my = growF64(this.my, size)
    this.w = growF64(this.w, size)
    this.h = growF64(this.h, size)
    this.type = growI32(this.type, size)
    this.look = growI32(this.look, size)
    this.anim = growI32(this.anim, size, -1)
    this.animTicks = growI32(this.animTicks, size)
    this.alive = growU8(this.alive, size)
    this.removing = growU8(this.removing, size)
    this.onGround = growU8(this.onGround, size)
    this.offscreen = growU8(this.offscreen, size)
    this.leftScreen = growU8(this.leftScreen, size)
    this.freeIds = growI32(this.freeIds, size)
  }
}
