import * as commerce from '@tokslearn/core/commerce'
import { createCtx, DomainError, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { paystackChargeSucceeded } from '../events'
import { jobRuntime } from '../runtime'

/**
 * Paystack `charge.success` (docs/08 §6): the same completeOrder the confirm call uses. It verifies
 * with Paystack itself, so a forged body can't pay for anything. Provider outages retry; a rule
 * failure (amount mismatch, unknown order) is recorded on the event and not retried.
 */
export const paystackCharge = inngest.createFunction(
  {
    id: 'paystack-charge',
    retries: 8,
    idempotency: 'event.data.eventId',
    triggers: [paystackChargeSucceeded],
  },
  async ({ event, step, runId }) => {
    const ctx = () =>
      createCtx({
        actor: systemActor('paystack-webhook'),
        db: jobRuntime().db(),
        requestId: runId,
        providers: jobRuntime().providers(),
      })
    const result = await step.run('complete-order', async () => {
      try {
        const done = await commerce.completeOrder(ctx(), {
          reference: event.data.reference,
          via: 'webhook',
        })
        return { status: done.status, error: null }
      } catch (error) {
        if (error instanceof DomainError && error.code !== 'PAYMENT_PROVIDER_UNAVAILABLE') {
          return { status: 'rejected', error: error.code }
        }
        throw error
      }
    })
    await step.run('mark-processed', () =>
      commerce.markPaymentEventProcessed(ctx(), {
        eventId: event.data.eventId,
        error: result.error ?? undefined,
      }),
    )
    return result
  },
)
