import { describe, expect, it } from 'vitest'
import { Catalog } from '../src/catalog.js'
import { MAX_INSTANCES } from '../src/config.js'
import { World } from '../src/world.js'
import { look, program, thing } from './build.js'

function makeWorld(capacity = 4) {
  const p = program({ things: [thing('a', { look: look.box(4, 6) }), thing('b', { size: { w: 2, h: 3 } })] })
  const catalog = new Catalog(p, new Map())
  return new World(catalog, capacity)
}

/**
 * @param {World} world
 * @param {number} t
 */
const ids = (world, t) => Array.from(world.lists[t].subarray(0, world.counts[t]))

describe('World', () => {
  it('spawns with type size and base look', () => {
    const world = makeWorld()
    const id = world.spawn(0, 5, 7)
    expect(world.x[id]).toBe(5)
    expect(world.y[id]).toBe(7)
    expect(world.prevX[id]).toBe(5)
    expect(world.w[id]).toBe(4)
    expect(world.h[id]).toBe(6)
    expect(world.anim[id]).toBe(-1)
    expect(world.liveCount).toBe(1)
    const other = world.spawn(1, 0, 0)
    expect(world.w[other]).toBe(2)
    expect(world.h[other]).toBe(3)
  })

  it('defers removal until flush and keeps creation order', () => {
    const world = makeWorld()
    const a = world.spawn(0, 0, 0)
    const b = world.spawn(0, 1, 0)
    const c = world.spawn(0, 2, 0)
    world.queueRemove(b)
    expect(world.alive[b]).toBe(1)
    expect(ids(world, 0)).toEqual([a, b, c])
    world.flush()
    expect(world.alive[b]).toBe(0)
    expect(ids(world, 0)).toEqual([a, c])
    expect(world.liveCount).toBe(2)
  })

  it('ignores duplicate removal requests', () => {
    const world = makeWorld()
    const a = world.spawn(0, 0, 0)
    world.queueRemove(a)
    world.queueRemove(a)
    world.flush()
    expect(world.liveCount).toBe(0)
  })

  it('applies queued spawns after removals and reuses ids', () => {
    const world = makeWorld()
    const a = world.spawn(0, 0, 0)
    world.queueRemove(a)
    world.queueSpawn(1, 9, 9)
    expect(world.flush()).toBe(true)
    expect(world.spawnedCount).toBe(1)
    const id = world.spawned[0]
    expect(id).toBe(a)
    expect(world.type[id]).toBe(1)
    expect(ids(world, 1)).toEqual([id])
    expect(ids(world, 0)).toEqual([])
  })

  it('grows capacity and preserves data', () => {
    const world = makeWorld(2)
    for (let i = 0; i < 10; i++) world.spawn(0, i, i * 2)
    expect(world.capacity).toBeGreaterThanOrEqual(10)
    expect(Array.from(world.x.subarray(0, 10))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(world.anim[9]).toBe(-1)
    expect(world.counts[0]).toBe(10)
  })

  it('refuses spawns past the instance cap', () => {
    const world = makeWorld(16)
    for (let i = 0; i < MAX_INSTANCES; i++) world.spawn(0, 0, 0)
    expect(world.spawn(0, 0, 0)).toBe(-1)
    world.queueSpawn(0, 0, 0)
    expect(world.flush()).toBe(false)
  })

  it('first() returns the earliest live instance', () => {
    const world = makeWorld()
    expect(world.first(0)).toBe(-1)
    const a = world.spawn(0, 0, 0)
    world.spawn(0, 0, 0)
    expect(world.first(0)).toBe(a)
  })
})
