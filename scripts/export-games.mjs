// Export every showcase game as one standalone HTML file, the same way the
// Studio's Export button does. Output: <out>/<game>.html (default site/public/play).
// Run: node scripts/export-games.mjs [out-dir]

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { compile, formatError } from '@minijs/lang'
import { MemoryFs } from '../playground/src/files/memory-fs.js'
import { collectImages, exportHtml } from '../playground/src/share/export-html.js'

const ROOT = join(import.meta.dirname, '..')
const OUT = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'site/public/play')
const GAMES = [
  ['cloud-hopper', 'Cloud Hopper'],
  ['star-defender', 'Star Defender'],
  ['crypt-dash', 'Crypt Dash'],
]

async function playerSource() {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: true,
      lib: { entry: join(ROOT, 'packages/runtime/src/player.js'), name: 'MiniPlayer', formats: ['iife'], fileName: () => 'player.js' },
    },
  })
  for (const out of Array.isArray(result) ? result : [result]) {
    const chunk = 'output' in out ? out.output.find((o) => o.type === 'chunk') : null
    if (chunk && chunk.type === 'chunk') return chunk.code
  }
  throw new Error('player build produced no code')
}

const player = await playerSource()
mkdirSync(OUT, { recursive: true })
for (const [folder, title] of GAMES) {
  const dir = join(ROOT, 'examples', folder)
  const source = readFileSync(join(dir, 'game.mini'), 'utf8')
  const { program, errors } = compile(source)
  if (!program) throw new Error(`${folder}: ${errors.map(formatError).join('\n')}`)
  /** @type {Record<string, string | Blob>} */
  const files = { 'game.mini': source }
  for (const name of readdirSync(join(dir, 'assets'))) {
    files[`assets/${name}`] = new Blob([readFileSync(join(dir, 'assets', name))], { type: 'image/png' })
  }
  const images = await collectImages(new MemoryFs(folder, files), 'game.mini', program)
  const html = exportHtml({ title, program, images, playerSource: player })
  writeFileSync(join(OUT, `${folder}.html`), html)
  console.log(`wrote ${join(OUT, `${folder}.html`)} (${(html.length / 1024).toFixed(0)} KB)`)
}
