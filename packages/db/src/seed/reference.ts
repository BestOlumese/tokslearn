import { createDb } from '../client'
import { seed } from '.'

// Reference data for every environment, run after migrations on each deploy (apps/web/vercel.json):
// settings, feature flags and the category tree. Idempotent; never creates demo users.
const url =
  process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_URL to seed reference data.')
  process.exit(1)
}
const handle = createDb(url, { max: 1, tcp: true })
try {
  await seed(handle.db)
  console.info('Reference data (settings, feature flags, categories) is up to date.')
} finally {
  await handle.close()
}
