import { defineConfig } from 'vite'

// The landing page. `npm run site:build` also puts the Studio in dist/studio
// and the exported games in dist/play (see scripts/assemble-site.mjs).
export default defineConfig({
  base: '/',
  publicDir: 'public',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5175 },
})
