import { log } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { exportRequested } from '../events'

/**
 * Stub (Phase 1 lists `me.exportData` as a stub job). The full export — JSON of profile, orders,
 * progress and certificates zipped to R2, then the `data-export-ready` email — lands with the
 * data it exports (Phase 5+). Tracked in docs/phases/phase-01 as an open item.
 */
export const dataExport = inngest.createFunction(
  { id: 'data-export', retries: 1, triggers: [exportRequested] },
  async ({ event }) => {
    log('info', 'data export requested (stub)', { module: 'identity', actor: event.data.userId })
    return { status: 'stub' }
  },
)
