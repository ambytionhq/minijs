import { defineConfig } from 'vite'

// Example pictures are bundled through import.meta.glob in src/main.js; projects
// load their own pictures from their files, so there is no public folder.
export default defineConfig({
  base: './',
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true },
})
