import { describe, expect, it } from 'vitest'
import { SpatialHash } from '../src/spatial-hash.ts'

const found = (hash: SpatialHash) => Array.from(hash.results.subarray(0, hash.resultCount)).sort((a, b) => a - b)

describe('SpatialHash', () => {
  it('finds boxes in overlapping cells', () => {
    const hash = new SpatialHash(10)
    hash.clear(3, 10)
    hash.insert(0, 0, 0, 5, 5)
    hash.insert(1, 100, 100, 5, 5)
    hash.insert(2, 8, 8, 5, 5)
    hash.query(0, 0, 4, 4)
    expect(found(hash)).toContain(0)
    expect(found(hash)).not.toContain(1)
  })

  it('returns each id once even when it spans many cells', () => {
    const hash = new SpatialHash(10)
    hash.clear(1, 4)
    hash.insert(3, 0, 0, 100, 100)
    hash.query(0, 0, 100, 100)
    expect(found(hash)).toEqual([3])
  })

  it('handles negative coordinates', () => {
    const hash = new SpatialHash(10)
    hash.clear(1, 4)
    hash.insert(1, -25, -25, 5, 5)
    hash.query(-30, -30, 10, 10)
    expect(found(hash)).toEqual([1])
  })

  it('clears between builds', () => {
    const hash = new SpatialHash(10)
    hash.clear(1, 4)
    hash.insert(1, 0, 0, 5, 5)
    hash.clear(1, 4)
    hash.query(0, 0, 5, 5)
    expect(found(hash)).toEqual([])
  })

  it('grows result and entry buffers', () => {
    const hash = new SpatialHash(10)
    hash.clear(500, 500)
    for (let i = 0; i < 500; i++) hash.insert(i, 0, 0, 5, 5)
    expect(hash.query(0, 0, 5, 5)).toBe(500)
  })
})
