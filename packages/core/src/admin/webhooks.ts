import { schema } from '@tokslearn/db'
import { and, eq } from 'drizzle-orm'
import type { Ctx } from '../kernel/ctx'

// Inbound webhook log for Bunny, Dojah and Daily (docs/06 §7, ADR-030). A redelivered event is
// acknowledged without being processed twice.

const { webhookEvents } = schema

/** 'new' the first time a provider event arrives, 'duplicate' after that. */
export async function recordWebhookEvent(
  ctx: Ctx,
  input: { provider: string; eventId: string; type: string; payload: Record<string, unknown> },
): Promise<'new' | 'duplicate'> {
  const rows = await ctx.db
    .insert(webhookEvents)
    .values(input)
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id })
  return rows.length > 0 ? 'new' : 'duplicate'
}

export async function markWebhookProcessed(
  ctx: Ctx,
  input: { provider: string; eventId: string; error?: string | undefined },
) {
  await ctx.db
    .update(webhookEvents)
    .set({ processedAt: ctx.now, error: input.error ?? null })
    .where(
      and(eq(webhookEvents.provider, input.provider), eq(webhookEvents.eventId, input.eventId)),
    )
}
