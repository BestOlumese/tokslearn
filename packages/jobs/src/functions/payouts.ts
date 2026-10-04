import * as commerce from '@tokslearn/core/commerce'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { payoutProviderUpdated, payoutRunApproved } from '../events'
import { jobRuntime } from '../runtime'

const ctx = (reason: string, requestId: string) =>
  createCtx({
    actor: systemActor(reason),
    db: jobRuntime().db(),
    requestId,
    providers: jobRuntime().providers(),
  })

/**
 * `payout-run-draft` (docs/08 §9, ADR-046): on the 1st at 06:00 Lagos, after the night's release,
 * the month's draft run, and the "ready for review" email to finance. Never rebuilds a draft.
 */
export const payoutRunDraft = inngest.createFunction(
  {
    id: 'payout-run-draft',
    retries: 3,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Lagos 0 6 1 * *' }],
  },
  async ({ step, runId }) =>
    step.run('draft', () => commerce.draftPayoutRun(ctx('payout-run-draft', runId))),
)

/**
 * `payout-run-process`: every morning at 09:05 Lagos, and as soon as a run is approved (or a
 * failed transfer retried), sends every approved run whose pay day has come: money to in_transit,
 * then Paystack bulk transfers of 100, five seconds apart (Paystack's guidance).
 */
export const payoutRunProcess = inngest.createFunction(
  {
    id: 'payout-run-process',
    retries: 5,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Lagos 5 9 * * *' }, payoutRunApproved],
  },
  async ({ step, runId }) => {
    const due = await step.run('due', () =>
      commerce.duePayoutRuns(ctx('payout-run-process', runId)),
    )
    let sent = 0
    let refused = 0
    for (const id of due) {
      const batches = await step.run(`prepare-${id}`, () =>
        commerce.preparePayoutRun(ctx('payout-run-process', runId), id),
      )
      for (const [i, batch] of batches.entries()) {
        if (i > 0) await step.sleep(`pause-${id}-${i}`, '5s')
        const r = await step.run(`send-${id}-${i}`, () =>
          commerce.sendPayoutBatch(ctx('payout-run-process', runId), batch),
        )
        sent += r.sent
        refused += r.refused
      }
    }
    return { runs: due.length, sent, refused }
  },
)

/**
 * `payout-settle`: after a transfer.* webhook, asks Paystack about that transfer and applies it
 * (paid, or money back to available with the instructor told). The hourly money job catches
 * webhooks that never came.
 */
export const payoutSettle = inngest.createFunction(
  {
    id: 'payout-settle',
    retries: 5,
    idempotency: 'event.data.eventId',
    concurrency: { limit: 1, key: 'event.data.reference' },
    triggers: [payoutProviderUpdated],
  },
  async ({ event, step, runId }) =>
    step.run('settle', () =>
      commerce.settlePayoutTransfer(ctx('payout-settle', runId), event.data.reference),
    ),
)
