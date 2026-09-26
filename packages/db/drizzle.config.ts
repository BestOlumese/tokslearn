import { defineConfig } from 'drizzle-kit'

// Migrations always use the direct (non-pooled) connection (docs/04 §3).
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  strict: true,
  verbose: true,
  ...(url ? { dbCredentials: { url } } : {}),
})
