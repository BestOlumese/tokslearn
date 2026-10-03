import type { EmailRequest } from '@tokslearn/emails/catalog'
import { inngest } from './client'
import {
  authEmailRequested,
  bunnyVideoChanged,
  outboxDispatchRequested,
  paystackChargeSucceeded,
  refundProviderUpdated,
} from './events'
import { accountDeletion } from './functions/account-deletion'
import { examAutosubmit } from './functions/assessments'
import { certificateBackfill, certificateIssue, certificateRender } from './functions/certificates'
import { commerceHourly } from './functions/commerce-hourly'
import { announcementSend } from './functions/community'
import { dataExport } from './functions/data-export'
import { earningsRelease, monthlyStatements } from './functions/earnings'
import { emailSend } from './functions/email-send'
import { badgesEvaluate, dripUnlocks, streakRollover } from './functions/learning'
import { ledgerIntegrity } from './functions/ledger-integrity'
import { liveReminders, recordingImport } from './functions/live'
import { notificationDigest, notificationsPrune } from './functions/notifications'
import { outboxDispatch } from './functions/outbox-dispatch'
import { paystackCharge } from './functions/paystack-charge'
import { refundSend, refundSettle } from './functions/refunds'
import { ratingStats } from './functions/reviews'
import { videoStatus } from './functions/video-status'
import { wishlistPriceDrop } from './functions/wishlist'

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
  badgesEvaluate,
  streakRollover,
  dripUnlocks,
  examAutosubmit,
  certificateIssue,
  certificateRender,
  certificateBackfill,
  announcementSend,
  liveReminders,
  recordingImport,
  ratingStats,
  notificationDigest,
  notificationsPrune,
  wishlistPriceDrop,
  refundSend,
  refundSettle,
  earningsRelease,
  monthlyStatements,
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

/** Hands a verified Paystack refund.* webhook to the refund-settle job. */
export async function requestRefundSettle(input: { reference: string; eventId: string }) {
  await inngest.send({ name: refundProviderUpdated.name, data: input })
}
