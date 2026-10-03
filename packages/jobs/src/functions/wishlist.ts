import * as commerce from '@tokslearn/core/commerce'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { couponAnnounced, coursePriceDropped } from '../events'
import { jobRuntime } from '../runtime'

/**
 * `wishlist-price-drop` (docs/23, ADR-042): pages through the people who saved the course(s),
 * 500 per step. Retries write nothing twice (each notice has a dedupe key).
 */
export const wishlistPriceDrop = inngest.createFunction(
  {
    id: 'wishlist-price-drop',
    retries: 3,
    triggers: [coursePriceDropped, couponAnnounced],
  },
  async ({ event, step, runId }) => {
    const input: commerce.PriceDropInput =
      'couponId' in event.data
        ? { kind: 'coupon', couponId: event.data.couponId }
        : { kind: 'price', ...event.data }
    let after: string | null = null
    let sent = 0
    for (let page = 0; page < 1000; page++) {
      const batch: { sent: number; after: string | null; done: boolean } = await step.run(
        `page-${page}`,
        () =>
          commerce.sendPriceDropNotices(
            createCtx({
              actor: systemActor('wishlist-price-drop'),
              db: jobRuntime().db(),
              requestId: runId,
              providers: jobRuntime().providers(),
            }),
            { ...input, after },
          ),
      )
      sent += batch.sent
      if (batch.done) break
      after = batch.after
    }
    return { sent }
  },
)
