import * as admin from '@tokslearn/core/admin'
import * as courses from '@tokslearn/core/courses'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import * as media from '@tokslearn/core/media'
import { inngest } from '../client'
import { bunnyVideoChanged } from '../events'
import { jobRuntime } from '../runtime'

/**
 * Video processing status (docs/09 §2 step 3): re-read the video from Bunny, store status,
 * duration and thumbnail, then copy the duration onto its lessons and course totals.
 */
export const videoStatus = inngest.createFunction(
  {
    id: 'video-status',
    retries: 5,
    idempotency: 'event.data.eventId',
    triggers: [bunnyVideoChanged],
  },
  async ({ event, step, runId }) => {
    const ctx = () =>
      createCtx({
        actor: systemActor('video-status'),
        db: jobRuntime().db(),
        requestId: runId,
        providers: jobRuntime().providers(),
      })
    const result = await step.run('refresh', async () => {
      const asset = await media.getVideoAssetByProviderId(ctx(), event.data.videoGuid)
      if (!asset) return { assetId: null, status: 'unknown' }
      const { asset: updated, changed } = await media.refreshVideoAsset(ctx(), asset.id)
      if (changed) await courses.onVideoAssetChanged(ctx(), asset.id)
      return { assetId: asset.id, status: updated.status }
    })
    await step.run('mark-processed', () =>
      admin.markWebhookProcessed(ctx(), { provider: 'bunny', eventId: event.data.eventId }),
    )
    return result
  },
)
