import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      'server-only': fileURLToPath(
        new URL('../../packages/config/server-only-stub.js', import.meta.url),
      ),
    },
  },
  test: { include: ['lib/**/*.test.ts', 'components/**/*.test.ts'], exclude: ['e2e/**'] },
})
