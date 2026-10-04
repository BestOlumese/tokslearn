import type { PayoutHoldReason, PayoutItemStatus, PayoutRunStatus } from '@tokslearn/contract'
import type { BadgeTone } from '@tokslearn/ui/badge'

// Words for payout states on the finance screens (ADR-046).

export const runStatus: Record<PayoutRunStatus, [BadgeTone, string]> = {
  draft: ['warning', 'Waiting for approval'],
  approved: ['info', 'Approved'],
  processing: ['info', 'Sending'],
  completed: ['brand', 'Paid'],
  partially_failed: ['danger', 'Some failed'],
}

export const itemStatus: Record<PayoutItemStatus, [BadgeTone, string]> = {
  queued: ['neutral', 'To pay'],
  held: ['warning', 'Held'],
  sending: ['info', 'Sending'],
  sent: ['info', 'With Paystack'],
  success: ['brand', 'Paid'],
  failed: ['danger', 'Failed'],
  reversed: ['danger', 'Reversed'],
}

export const holdReason: Record<PayoutHoldReason, string> = {
  no_payout_account: 'No bank account',
  payout_account_in_review: 'Bank account waiting for review',
  payout_account_on_hold: 'Bank account changed in the last 72 hours',
  kyc_not_verified: 'Identity not verified',
  two_factor_off: 'Two-factor is off',
  suspended: 'Account suspended',
  below_minimum: 'Under the minimum after refunds owed',
  finance_hold: 'Held by finance',
}

export const anomaly: Record<string, string> = {
  first_payout: 'First payout',
  new_account: 'New bank account since last payout',
  over_3x_last: 'Over 3× their last payout',
}
