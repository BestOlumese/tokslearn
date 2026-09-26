import type { EmailRequest } from '@tokslearn/emails/catalog'
import { inngest } from './client'
import { authEmailRequested, outboxDispatchRequested } from './events'
import { accountDeletion } from './functions/account-deletion'
import { dataExport } from './functions/data-export'
import { emailSend } from './functions/email-send'
import { outboxDispatch } from './functions/outbox-dispatch'

export { inngest } from './client'
export { featureFlagUpdated, outboxDispatchRequested } from './events'
export { configureJobs, type JobRuntime } from './runtime'

/** Every function served from /api/inngest. */
export const functions = [outboxDispatch, emailSend, accountDeletion, dataExport]

/** After-commit hook for request contexts: deliver outbox rows now instead of waiting for cron. */
export async function requestOutboxDispatch(): Promise<void> {
  await inngest.send({ name: outboxDispatchRequested.name, data: {} })
}

/** Auth emails with sign-in secrets go straight to the email job, not through the outbox. */
export async function requestAuthEmail(email: EmailRequest): Promise<void> {
  await inngest.send({ name: authEmailRequested.name, data: { ...email, data: { ...email.data } } })
}
