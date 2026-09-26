/** Email boundary (Resend). Templates come from packages/emails (docs/23). */
export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  headers?: Readonly<Record<string, string>>
  /** Idempotency key so a retried job never sends twice. */
  idempotencyKey: string
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ id: string }>
}
