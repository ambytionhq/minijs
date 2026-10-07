import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { minijsPlayer } from './plugins/player.js'
import { serviceWorker } from './plugins/service-worker.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// Example pictures are bundled through import.meta.glob; projects load their own
// pictures from their files, so there is no public folder.
export default defineConfig({
  base: './',
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [minijsPlayer(), serviceWorker()],
  build: { outDir: 'dist', emptyOutDir: true },
})
