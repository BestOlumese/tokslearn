import * as commerce from '@tokslearn/core/commerce'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { refundApproved, refundProviderUpdated } from '../events'
import { jobRuntime } from '../runtime'

const ctx = (reason: string, requestId: string) =>
  createCtx({
    actor: systemActor(reason),
    db: jobRuntime().db(),
    requestId,
    providers: jobRuntime().providers(),
  })

/** `refund-send` (docs/08 §7): asks Paystack to refund an approved request. Retries on outages. */
export const refundSend = inngest.createFunction(
  {
    id: 'refund-send',
    retries: 8,
    idempotency: 'event.data.refundId',
    triggers: [refundApproved],
  },
  async ({ event, step, runId }) => {
    const result = await step.run('send', () =>
      commerce.sendRefund(ctx('refund-send', runId), event.data.refundId),
    )
    return { refundId: event.data.refundId, result }
  },
)

/**
 * `refund-settle`: after a refund.* webhook, asks Paystack about each refund still in flight for
 * that transaction and finishes the processed ones (ledger entry, statuses, notices).
 */
export const refundSettle = inngest.createFunction(
  {
    id: 'refund-settle',
    retries: 5,
    idempotency: 'event.data.eventId',
    concurrency: { limit: 1, key: 'event.data.reference' },
    triggers: [refundProviderUpdated],
  },
  async ({ event, step, runId }) =>
    step.run('settle', () =>
      commerce.settleRefunds(ctx('refund-settle', runId), { reference: event.data.reference }),
    ),
)
