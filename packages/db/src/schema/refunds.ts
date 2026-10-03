import { sql } from 'drizzle-orm'
import { index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { baseColumns, kobo, tstz } from '../columns'
import { orderItems, orders } from './commerce'
import { user } from './identity'

// Refunds (docs/05 refunds, docs/08 §7, ADR-043). One request per order item; a denial can be
// appealed once (same row). Approved requests go to Paystack; the refund.processed webhook (or
// the reconcile check) finishes them with a ledger entry.

export const refundStatusEnum = pgEnum('refund_status', [
  /** Waiting for finance: the abuse check, or an appeal. */
  'under_review',
  'approved',
  'denied',
  /** Sent to Paystack. */
  'processing',
  'processed',
  /** Paystack couldn't refund it; finance retries or closes it. */
  'failed',
])
export const refundReasonEnum = pgEnum('refund_reason', [
  'not_as_described',
  'quality',
  'technical',
  'duplicate',
  'changed_mind',
  'other',
])

export const refundRequests = pgTable(
  'refund_requests',
  {
    ...baseColumns(),
    publicId: text().notNull().unique(),
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    courseId: uuid().notNull(),
    instructorId: uuid().notNull(),
    amountKobo: kobo().notNull(),
    reasonCode: refundReasonEnum().notNull(),
    reasonText: text(),
    status: refundStatusEnum().notNull(),
    /** How it was decided: automatically from the rules, or by finance. */
    decidedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    decidedAt: tstz(),
    /** The rule that denied it (an error code), or finance's words. */
    decisionReason: text(),
    /** What the eligibility engine saw at request time. */
    eligibilitySnapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    appealText: text(),
    appealedAt: tstz(),
    providerRefundId: text(),
    sentAt: tstz(),
    processedAt: tstz(),
    failureReason: text(),
  },
  (t) => [
    uniqueIndex().on(t.orderItemId),
    index().on(t.userId, t.createdAt.desc()),
    index().on(t.orderId),
    index().on(t.decidedBy),
    index('refund_requests_queue_idx').on(t.createdAt).where(sql`${t.status} = 'under_review'`),
    index('refund_requests_processing_idx').on(t.sentAt).where(sql`${t.status} = 'processing'`),
  ],
)
