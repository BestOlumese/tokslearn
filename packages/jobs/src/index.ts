import type { EmailRequest } from '@tokslearn/emails/catalog'
import { inngest } from './client'
import {
  authEmailRequested,
  bunnyVideoChanged,
  outboxDispatchRequested,
  paystackChargeSucceeded,
} from './events'
import { accountDeletion } from './functions/account-deletion'
import { commerceHourly } from './functions/commerce-hourly'
import { dataExport } from './functions/data-export'
import { emailSend } from './functions/email-send'
import { ledgerIntegrity } from './functions/ledger-integrity'
import { outboxDispatch } from './functions/outbox-dispatch'
import { paystackCharge } from './functions/paystack-charge'
import { videoStatus } from './functions/video-status'

export { inngest } from './client'
export { bunnyVideoChanged, featureFlagUpdated, outboxDispatchRequested } from './events'
export { configureJobs, type JobRuntime } from './runtime'

/** Every function served from /api/inngest. */
export const functions = [
  outboxDispatch,
  emailSend,
  accountDeletion,
  dataExport,
  videoStatus,
  paystackCharge,
  commerceHourly,
  ledgerIntegrity,
]

/** After-commit hook for request contexts: deliver outbox rows now instead of waiting for cron. */
export async function requestOutboxDispatch(): Promise<void> {
  await inngest.send({ name: outboxDispatchRequested.name, data: {} })
}

/** Auth emails with sign-in secrets go straight to the email job, not through the outbox. */
export async function requestAuthEmail(email: EmailRequest): Promise<void> {
  await inngest.send({ name: authEmailRequested.name, data: { ...email, data: { ...email.data } } })
}

/** Hands a verified Bunny webhook to the video-status job. */
export async function requestVideoRefresh(input: { videoGuid: string; eventId: string }) {
  await inngest.send({ name: bunnyVideoChanged.name, data: input })
}

/** Hands a verified Paystack charge.success webhook to the paystack-charge job. */
export async function requestPaystackCharge(input: { reference: string; eventId: string }) {
  await inngest.send({ name: paystackChargeSucceeded.name, data: input })
}
