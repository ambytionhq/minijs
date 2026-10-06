import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'playground/test/**/*.test.ts'],
    benchmark: {
      include: ['packages/*/bench/**/*.bench.ts'],
    },
  },
})
