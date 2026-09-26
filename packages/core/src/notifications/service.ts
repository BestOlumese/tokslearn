import type { EmailData, EmailId } from '@tokslearn/emails/catalog'
import type { Ctx } from '../kernel/ctx'

/**
 * Queues one catalog email through the outbox (docs/13 §3, docs/23 rules). Never calls Resend
 * from a request. Emails that carry sign-in secrets (codes, reset links) skip the outbox so the
 * secret is never stored in our database; the auth package sends those straight to the job
 * (ADR-028).
 */
export async function sendEmail<Id extends EmailId>(
  ctx: Ctx,
  email: { id: Id; to: string; data: EmailData[Id]; businessKey: string },
): Promise<void> {
  await ctx.events.emit('notification.email_requested', {
    id: email.id,
    to: email.to,
    data: email.data as unknown as Record<string, unknown>,
    idempotencyKey: `${email.id}:${email.businessKey}`,
  })
}
