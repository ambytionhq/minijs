import { defineConfig } from 'vite'

// The site build script includes the Studio in dist/studio and the exported
// games in dist/play. Running Vite alone only builds the landing page.
export default defineConfig({
  base: '/',
  publicDir: 'public',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5175 },
})
