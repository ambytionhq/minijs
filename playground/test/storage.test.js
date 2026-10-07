import { describe, expect, it } from 'vitest'
import { clearSource, loadSetting, loadSource, saveSetting, saveSource } from '../src/storage.js'

/** In-memory Storage stand-in. */
function memoryStorage() {
  const map = new Map()
  return /** @type {Storage} */ (
    /** @type {unknown} */ ({
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    })
  )
}

/** Storage where every call throws, like a blocked or full store. */
const throwing = /** @type {Storage} */ (
  /** @type {unknown} */ ({
    getItem() {
      throw new Error('blocked')
    },
    setItem() {
      throw new Error('quota')
    },
    removeItem() {
      throw new Error('blocked')
    },
  })
)

describe('storage', () => {
  it('round-trips source and settings', () => {
    const s = memoryStorage()
    expect(loadSource('dodge', s)).toBeNull()
    saveSource('dodge', 'game', s)
    expect(loadSource('dodge', s)).toBe('game')
    clearSource('dodge', s)
    expect(loadSource('dodge', s)).toBeNull()
    saveSetting('example', 'hero', s)
    expect(loadSetting('example', s)).toBe('hero')
  })

  it('never throws when storage fails', () => {
    expect(loadSource('x', throwing)).toBeNull()
    expect(() => saveSource('x', 'y', throwing)).not.toThrow()
    expect(() => clearSource('x', throwing)).not.toThrow()
    expect(loadSetting('x', throwing)).toBeNull()
    expect(() => saveSetting('x', 'y', throwing)).not.toThrow()
  })

  it('works with no storage at all', () => {
    expect(loadSource('x', null)).toBeNull()
    expect(() => saveSource('x', 'y', null)).not.toThrow()
  })
})
