// Spatial hash broadphase with zero per-tick allocation once warmed up.
// Cells are hashed into a power-of-two bucket table; each bucket is a linked
// list stored in typed arrays. Distinct cells that collide in one bucket only
// add extra candidates, which callers filter with an exact overlap test.

import { CELL_SIZE } from './config.ts'

const MIN_BUCKETS = 1024

function nextPowerOfTwo(n: number): number {
  let p = MIN_BUCKETS
  while (p < n) p *= 2
  return p
}

export class SpatialHash {
  readonly cellSize: number
  /** Query results. Valid entries are `results[0 .. resultCount)`. */
  results: Int32Array = new Int32Array(64)
  resultCount = 0

  private heads: Int32Array = new Int32Array(MIN_BUCKETS).fill(-1)
  private mask = MIN_BUCKETS - 1
  private entryId: Int32Array = new Int32Array(256)
  private entryNext: Int32Array = new Int32Array(256)
  private entryCount = 0
  private stamps: Uint32Array = new Uint32Array(256)
  private stamp = 0

  constructor(cellSize = CELL_SIZE) {
    this.cellSize = cellSize
  }

  /** Reset for a new build. `expectedEntries` sizes the bucket table; `idCapacity` bounds ids. */
  clear(expectedEntries: number, idCapacity: number): void {
    const buckets = nextPowerOfTwo(expectedEntries * 2)
    if (buckets !== this.heads.length) {
      this.heads = new Int32Array(buckets)
      this.mask = buckets - 1
    }
    this.heads.fill(-1)
    this.entryCount = 0
    if (this.stamps.length < idCapacity) {
      this.stamps = new Uint32Array(idCapacity)
      this.stamp = 0
    }
  }

  insert(id: number, x: number, y: number, w: number, h: number): void {
    const size = this.cellSize
    const x0 = Math.floor(x / size)
    const y0 = Math.floor(y / size)
    const x1 = Math.floor((x + w) / size)
    const y1 = Math.floor((y + h) / size)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.bucket(cx, cy)
        if (this.entryCount === this.entryId.length) this.growEntries()
        const e = this.entryCount++
        this.entryId[e] = id
        this.entryNext[e] = this.heads[bucket]!
        this.heads[bucket] = e
      }
    }
  }

  /** Collect unique candidate ids whose cells intersect the box into `results`. Returns the count. */
  query(x: number, y: number, w: number, h: number): number {
    const size = this.cellSize
    const x0 = Math.floor(x / size)
    const y0 = Math.floor(y / size)
    const x1 = Math.floor((x + w) / size)
    const y1 = Math.floor((y + h) / size)
    this.stamp++
    if (this.stamp === 0xffffffff) {
      this.stamps.fill(0)
      this.stamp = 1
    }
    let count = 0
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        let e = this.heads[this.bucket(cx, cy)]!
        while (e !== -1) {
          const id = this.entryId[e]!
          if (this.stamps[id] !== this.stamp) {
            this.stamps[id] = this.stamp
            if (count === this.results.length) {
              const grown = new Int32Array(this.results.length * 2)
              grown.set(this.results)
              this.results = grown
            }
            this.results[count++] = id
          }
          e = this.entryNext[e]!
        }
      }
    }
    this.resultCount = count
    return count
  }

  private bucket(cx: number, cy: number): number {
    return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.mask
  }

  private growEntries(): void {
    const size = this.entryId.length * 2
    const ids = new Int32Array(size)
    ids.set(this.entryId)
    const next = new Int32Array(size)
    next.set(this.entryNext)
    this.entryId = ids
    this.entryNext = next
  }
}
