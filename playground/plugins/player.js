// `import playerSource from 'virtual:minijs-player'` gives the Studio the
// standalone player (packages/runtime/src/player.js) as one minified script,
// ready to inline into exported HTML games. Built once per dev server or build.

import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const ID = 'virtual:minijs-player'
const RESOLVED = `\0${ID}`
const ENTRY = fileURLToPath(new URL('../../packages/runtime/src/player.js', import.meta.url))

/** @returns {import('vite').Plugin} */
export function minijsPlayer() {
  /** @type {Promise<string> | null} */
  let code = null
  const bundle = async () => {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: true,
        sourcemap: false,
        lib: { entry: ENTRY, name: 'MiniPlayer', formats: ['iife'], fileName: () => 'player.js' },
      },
    })
    const outputs = Array.isArray(result) ? result : [result]
    for (const out of outputs) {
      if ('output' in out) {
        const chunk = out.output.find((o) => o.type === 'chunk')
        if (chunk && chunk.type === 'chunk') return chunk.code
      }
    }
    throw new Error('minijs player build produced no code')
  }
  return {
    name: 'minijs-player',
    resolveId(id) {
      return id === ID ? RESOLVED : null
    },
    async load(id) {
      if (id !== RESOLVED) return null
      code ??= bundle()
      return `export default ${JSON.stringify(await code)}`
    },
    handleHotUpdate({ file }) {
      // Runtime source changed: rebuild the player next time it is asked for.
      if (file.includes('/packages/runtime/src/')) code = null
    },
  }
}
