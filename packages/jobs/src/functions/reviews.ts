import { createCtx, noopCache, systemActor } from '@tokslearn/core/kernel'
import * as reviews from '@tokslearn/core/reviews'
import { inngest } from '../client'
import { reviewChanged } from '../events'
import { jobRuntime } from '../runtime'

/**
 * `rating-stats` (docs/10 §12): recomputes a course's rating from its visible reviews, updates
 * its search row and expires the cached course, instructor and listing pages. Bursts of changes
 * to one course collapse into one run.
 */
export const ratingStats = inngest.createFunction(
  {
    id: 'rating-stats',
    retries: 3,
    concurrency: { limit: 1, key: 'event.data.courseId' },
    debounce: { key: 'event.data.courseId', period: '10s' },
    triggers: [reviewChanged],
  },
  async ({ event, step, runId }) => {
    const stars = await step.run('recompute', () =>
      reviews.recomputeRatingStats(
        createCtx({
          actor: systemActor('rating-stats'),
          db: jobRuntime().db(),
          requestId: runId,
          providers: jobRuntime().providers(),
          cache: jobRuntime().cache?.() ?? noopCache,
        }),
        event.data.courseId,
      ),
    )
    return { courseId: event.data.courseId, count: stars.count, avg: stars.avg }
  },
)
