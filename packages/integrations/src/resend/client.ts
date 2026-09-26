import 'server-only'
import type { EmailSender } from './types'

/** Resend over its REST API (docs/13 §3). Idempotency-Key makes retried jobs safe. */
export function createResendSender(config: {
  apiKey: string
  from: string
  replyTo?: string | undefined
}): EmailSender {
  return {
    async send(message) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': message.idempotencyKey.slice(0, 256),
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo ?? config.replyTo,
          headers: message.headers,
        }),
      })
      if (!res.ok) {
        // Body may echo the recipient; log only the status upstream.
        throw new Error(`Resend responded ${res.status}`)
      }
      const body = (await res.json()) as { id?: string }
      return { id: body.id ?? 'unknown' }
    },
  }
}

/** Local development without a Resend key: prints the email so codes and links are usable. */
export function createConsoleSender(): EmailSender {
  return {
    async send(message) {
      const links = [...message.text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0])
      console.info(
        `\n[email → ${message.to}] ${message.subject}\n${links.length ? `links: ${links.join('  ')}\n` : ''}`,
      )
      return { id: `console-${Date.now()}` }
    },
  }
}
