import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.js', 'playground/test/**/*.test.js'],
    benchmark: {
      include: ['packages/*/bench/**/*.bench.js'],
    },
  },
})
