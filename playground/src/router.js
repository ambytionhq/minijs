// Hash routes, so the Studio works from any folder and offline:
//   #/                       projects
//   #/p/<project>[/<file>]   edit a project, optionally open one file
//   #/learn                  the tutorial
//   #/play/<code>            play a shared game
//   #/open/<code>            save a shared game as a project
//   #/demo/<example>         play a showcase game full screen

/**
 * @typedef {(
 *   | { view: 'home' }
 *   | { view: 'project'; project: string; file: string | null }
 *   | { view: 'learn' }
 *   | { view: 'play'; code: string }
 *   | { view: 'open'; code: string }
 *   | { view: 'demo'; example: string }
 * )} Route
 */

/**
 * @param {string} hash
 * @returns {Route}
 */
export function parseRoute(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  switch (parts[0]) {
    case 'p':
      if (parts[1]) return { view: 'project', project: parts[1], file: parts.length > 2 ? parts.slice(2).join('/') : null }
      break
    case 'learn':
      return { view: 'learn' }
    case 'play':
      if (parts[1]) return { view: 'play', code: parts[1] }
      break
    case 'open':
      if (parts[1]) return { view: 'open', code: parts[1] }
      break
    case 'demo':
      if (parts[1]) return { view: 'demo', example: parts[1] }
      break
  }
  return { view: 'home' }
}

/**
 * @param {Route} route
 * @returns {string}
 */
export function routeHash(route) {
  switch (route.view) {
    case 'home':
      return '#/'
    case 'project':
      return `#/p/${encodeURIComponent(route.project)}${route.file ? `/${route.file.split('/').map(encodeURIComponent).join('/')}` : ''}`
    case 'learn':
      return '#/learn'
    case 'play':
      return `#/play/${route.code}`
    case 'open':
      return `#/open/${route.code}`
    case 'demo':
      return `#/demo/${encodeURIComponent(route.example)}`
  }
}

/** @param {Route} route */
export function go(route) {
  const hash = routeHash(route)
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'))
  else location.hash = hash
}

/**
 * Change the address without switching views (e.g. after opening another file).
 * @param {Route} route
 */
export function replaceRoute(route) {
  history.replaceState(null, '', routeHash(route))
}
