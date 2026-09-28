import { schema } from '@tokslearn/db'
import { and, eq } from 'drizzle-orm'
import type { Ctx } from '../kernel/ctx'

// Paystack webhooks, recorded once each (docs/06 §7, ADR-030 keeps them apart from other
// providers' webhooks). Event ids end with the order reference so the admin order page can list
// an order's webhooks.

const { paymentEvents } = schema

export const paystackEventId = (event: string, transactionId: string | number, reference: string) =>
  `${event}:${transactionId}:${reference}`

/** 'new' the first time, 'duplicate' for a redelivery (acknowledged, not processed again). */
export async function recordPaymentEvent(
  ctx: Ctx,
  input: { eventId: string; type: string; payload: Record<string, unknown> },
): Promise<'new' | 'duplicate'> {
  const rows = await ctx.db
    .insert(paymentEvents)
    .values({ provider: 'paystack', ...input })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id })
  return rows.length > 0 ? 'new' : 'duplicate'
}

export async function markPaymentEventProcessed(
  ctx: Ctx,
  input: { eventId: string; error?: string | undefined },
) {
  await ctx.db
    .update(paymentEvents)
    .set({ processedAt: ctx.now, error: input.error ?? null })
    .where(and(eq(paymentEvents.provider, 'paystack'), eq(paymentEvents.eventId, input.eventId)))
}
