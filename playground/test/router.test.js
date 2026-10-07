import { describe, expect, it } from 'vitest'
import { parseRoute, routeHash } from '../src/router.js'

describe('router', () => {
  it('parses every view', () => {
    expect(parseRoute('')).toEqual({ view: 'home' })
    expect(parseRoute('#/')).toEqual({ view: 'home' })
    expect(parseRoute('#/nonsense')).toEqual({ view: 'home' })
    expect(parseRoute('#/p/browser%3Aabc')).toEqual({ view: 'project', project: 'browser:abc', file: null })
    expect(parseRoute('#/p/example%3Abasics/levels/one%20two.mini')).toEqual({
      view: 'project',
      project: 'example:basics',
      file: 'levels/one two.mini',
    })
    expect(parseRoute('#/learn')).toEqual({ view: 'learn' })
    expect(parseRoute('#/play/m1abc')).toEqual({ view: 'play', code: 'm1abc' })
    expect(parseRoute('#/open/m1abc')).toEqual({ view: 'open', code: 'm1abc' })
    expect(parseRoute('#/demo/cloud-hopper')).toEqual({ view: 'demo', example: 'cloud-hopper' })
  })

  it('round-trips', () => {
    for (const route of [
      { view: 'home' },
      { view: 'project', project: 'disk:x y', file: 'a/b c.mini' },
      { view: 'project', project: 'example:basics', file: null },
      { view: 'learn' },
      { view: 'play', code: 'm1Zz_-' },
      { view: 'demo', example: 'crypt-dash' },
    ]) {
      expect(parseRoute(routeHash(/** @type {any} */ (route)))).toEqual(route)
    }
  })
})
