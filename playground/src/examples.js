// Every examples/*.mini file, bundled as text. Keys are file names without ".mini".

const files = import.meta.glob('../../examples/*.mini', { query: '?raw', import: 'default', eager: true })

/** @type {Map<string, string>} */
export const EXAMPLES = new Map(
  Object.entries(files)
    .map(([path, text]) => [path.replace(/^.*\//, '').replace(/\.mini$/, ''), /** @type {string} */ (text)])
    .sort(([a], [b]) => (a === 'platformer' ? -1 : b === 'platformer' ? 1 : a.localeCompare(b))),
)
