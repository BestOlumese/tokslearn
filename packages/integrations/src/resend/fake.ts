import type { EmailMessage, EmailSender } from './types'

/** Records messages instead of sending; repeated idempotency keys are ignored like Resend does. */
export function createFakeEmail(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = []
  const seen = new Map<string, string>()
  return {
    sent,
    async send(message) {
      const existing = seen.get(message.idempotencyKey)
      if (existing) return { id: existing }
      const id = `fake-email-${sent.length + 1}`
      seen.set(message.idempotencyKey, id)
      sent.push(message)
      return { id }
    },
  }
}
