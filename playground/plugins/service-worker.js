// Writes sw.js at build time: a service worker that keeps every file of this
// build in the browser, so the Studio opens and works with no internet.
// A new build gets a new cache name; the page offers "Reload" when it's ready.

import { createHash } from 'node:crypto'

/**
 * @param {string[]} files URLs relative to the Studio's folder
 * @param {string} version
 */
export function serviceWorkerSource(files, version) {
  return `// minijs Studio offline support. Generated at build time; do not edit.
const CACHE = ${JSON.stringify(`minijs-studio-${version}`)}
const FILES = ${JSON.stringify(files)}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('minijs-studio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    // Every page of the Studio is index.html; the part after # picks the view.
    event.respondWith(caches.match('./index.html', { cacheName: CACHE }).then((hit) => hit || fetch(request)))
    return
  }
  event.respondWith(caches.match(request, { cacheName: CACHE }).then((hit) => hit || fetch(request)))
})
`
}

/** @returns {import('vite').Plugin} */
export function serviceWorker() {
  return {
    name: 'minijs-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./', './index.html', ...Object.keys(bundle).map((f) => `./${f}`)]
        // Old font formats (ttf, woff, svg fonts) are fallbacks no current browser loads.
        .filter((f, i, all) => all.indexOf(f) === i && !f.endsWith('.map') && !/\.(ttf|woff|eot)$/.test(f) && !/Phosphor-[^/]*\.svg$/.test(f))
        .sort()
      const hash = createHash('sha256')
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name]
        hash.update(name)
        hash.update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source))
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(files, hash.digest('hex').slice(0, 12)) })
    },
  }
}
