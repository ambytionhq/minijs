import { describe, expect, it } from 'vitest'
import { serviceWorker, serviceWorkerSource } from '../plugins/service-worker.js'

/** Run the plugin's generateBundle on a fake bundle and return the emitted sw.js. */
function emit(bundle) {
  const plugin = serviceWorker()
  /** @type {any} */
  let emitted = null
  const generate = /** @type {Function} */ (plugin.generateBundle)
  generate.call({ emitFile: (f) => (emitted = f) }, {}, bundle)
  return emitted
}

describe('service worker', () => {
  it('lists every built file and index.html', () => {
    const out = emit({
      'assets/index-abc.js': { type: 'chunk', code: 'x' },
      'assets/font.woff2': { type: 'asset', source: new Uint8Array([1, 2]) },
      'manifest.webmanifest': { type: 'asset', source: '{}' },
      'assets/Phosphor-x.ttf': { type: 'asset', source: 'x' },
      'assets/Phosphor-x.svg': { type: 'asset', source: 'x' },
      'assets/geist.woff': { type: 'asset', source: 'x' },
    })
    expect(out.source).not.toContain('.ttf')
    expect(out.source).not.toContain('Phosphor-x.svg')
    expect(out.source).not.toContain('geist.woff"')
    expect(out.fileName).toBe('sw.js')
    expect(out.source).toContain('"./assets/index-abc.js"')
    expect(out.source).toContain('"./assets/font.woff2"')
    expect(out.source).toContain('"./index.html"')
  })

  it('changes its cache name when any file changes', () => {
    const a = emit({ 'a.js': { type: 'chunk', code: 'one' } }).source
    const b = emit({ 'a.js': { type: 'chunk', code: 'two' } }).source
    const name = (s) => /const CACHE = "([^"]+)"/.exec(s)[1]
    expect(name(a)).not.toBe(name(b))
    expect(name(a)).toBe(name(emit({ 'a.js': { type: 'chunk', code: 'one' } }).source))
  })

  it('is valid JavaScript', () => {
    expect(() => new Function(serviceWorkerSource(['./'], 'v'))).not.toThrow()
  })
})
