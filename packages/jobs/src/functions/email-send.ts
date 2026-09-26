import { type EmailData, type EmailId, emailIds, renderEmail } from '@tokslearn/emails'
import { NonRetriableError } from 'inngest'
import { inngest } from '../client'
import { authEmailRequested, emailRequested } from '../events'
import { jobRuntime } from '../runtime'

/**
 * Renders a catalog email and sends it through Resend (docs/13 §2 `email-send`). Deduplicated
 * by the email's idempotency key for 24 h, and Resend gets the same key.
 */
export const emailSend = inngest.createFunction(
  {
    id: 'email-send',
    retries: 5,
    idempotency: 'event.data.idempotencyKey',
    throttle: { limit: 50, period: '1s' },
    triggers: [emailRequested, authEmailRequested],
  },
  async ({ event, step }) => {
    const { id, to, data, idempotencyKey } = event.data
    if (!emailIds.includes(id as EmailId)) {
      throw new NonRetriableError(`Unknown email template "${id}"`)
    }
    const rendered = await step.run('render', () =>
      renderEmail(id as EmailId, data as unknown as EmailData[EmailId]),
    )
    const sent = await step.run('send', () =>
      jobRuntime().emailSender().send({
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey,
      }),
    )
    return { template: id, providerId: sent.id }
  },
)
