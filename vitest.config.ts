import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // The PAGE-017 Playwright specs live in ./e2e and match vitest's default `*.spec.ts`
    // glob. They need a browser and three running servers, so keep them out of the unit
    // runner; they run via `npm run test:e2e`.
    exclude: ['node_modules/**', 'e2e/**', '.next*/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
