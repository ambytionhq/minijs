// The built-in example projects, bundled with the app so they work offline.
// Each folder under examples/ is one project: its .mini files plus assets/.

import { ExamplesFs } from '../files/examples-fs.js'

const texts = /** @type {Record<string, string>} */ (
  import.meta.glob('../../../examples/**/*.mini', { query: '?raw', import: 'default', eager: true })
)
const assetUrls = /** @type {Record<string, string>} */ (
  import.meta.glob('../../../examples/**/assets/*', { query: '?url', import: 'default', eager: true })
)

/**
 * @typedef {object} ExampleInfo
 * @property {string} folder folder under examples/
 * @property {string} name
 * @property {string} blurb one line for the card
 * @property {string} main the .mini file to open first
 * @property {'showcase' | 'basics'} kind
 */

/** @type {ExampleInfo[]} */
export const EXAMPLE_INFO = [
  {
    folder: 'cloud-hopper',
    name: 'Cloud Hopper',
    blurb: 'A sky-high platformer. Hop the gaps, dodge the saws, grab all 20 stars.',
    main: 'game.mini',
    kind: 'showcase',
  },
  {
    folder: 'star-defender',
    name: 'Star Defender',
    blurb: 'Rocks and aliens fall faster every wave. Hold fire and survive.',
    main: 'game.mini',
    kind: 'showcase',
  },
  {
    folder: 'crypt-dash',
    name: 'Crypt Dash',
    blurb: 'Sneak past the ghosts, find 8 gems and the key, then take the stairs out.',
    main: 'game.mini',
    kind: 'showcase',
  },
  {
    folder: 'basics',
    name: 'Basics',
    blurb: 'Six small games, one idea each: jumping, clicking, pictures, controls.',
    main: 'platformer.mini',
    kind: 'basics',
  },
]

/**
 * @param {Record<string, string>} files glob result
 * @param {string} folder
 */
function inFolder(files, folder) {
  const prefix = `/examples/${folder}/`
  /** @type {Array<[string, string]>} */
  const out = []
  for (const [path, value] of Object.entries(files)) {
    const i = path.indexOf(prefix)
    if (i >= 0) out.push([path.slice(i + prefix.length), value])
  }
  return out
}

/** @type {Map<string, { info: ExampleInfo; fs: ExamplesFs }>} */
export const EXAMPLES = new Map(
  EXAMPLE_INFO.map((info) => {
    const id = `example:${info.folder}`
    const fs = new ExamplesFs({
      id,
      name: info.name,
      texts: new Map(inFolder(texts, info.folder).sort(([a], [b]) => a.localeCompare(b))),
      assets: new Map(inFolder(assetUrls, info.folder).map(([path, url]) => [path.replace(/^assets\//, ''), url])),
    })
    return [id, { info, fs }]
  }),
)
