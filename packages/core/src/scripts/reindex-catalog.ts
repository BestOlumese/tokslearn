// Deploy step: adds live courses missing from the search index (courses published before
// Phase 3, or a failed reindex). Safe to run on every deploy.
//   DATABASE_URL=… pnpm db:reindex

import { createDb } from '@tokslearn/db'
import { reindexMissing } from '../catalog'
import { systemActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  const ctx = createCtx({
    db,
    actor: systemActor('search reindex on deploy'),
    requestId: 'reindex',
  })
  const n = await reindexMissing(ctx)
  console.info(n === 0 ? 'Search index up to date.' : `Indexed ${n} course(s) missing from search.`)
} finally {
  await close()
}
