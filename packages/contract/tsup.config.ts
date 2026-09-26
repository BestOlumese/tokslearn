import { defineConfig } from 'tsup'

// Builds standalone ESM + types so the Expo app can consume the contract with zero server
// dependencies (docs/17 §1.10). CI runs this build in isolation.
export default defineConfig({
  entry: ['src/index.ts', 'src/messages.ts', 'src/auth-messages.ts'],
  format: ['esm'],
  // tsup's dts step sets `baseUrl` internally, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
  sourcemap: true,
  target: 'es2022',
  platform: 'neutral',
  external: ['zod', '@orpc/contract'],
})
