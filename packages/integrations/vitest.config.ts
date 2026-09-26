import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // `server-only` throws outside the Next.js server bundle; tests run in plain Node.
    alias: {
      'server-only': fileURLToPath(new URL('../config/server-only-stub.js', import.meta.url)),
    },
  },
  test: { include: ['src/**/*.test.ts'] },
})
