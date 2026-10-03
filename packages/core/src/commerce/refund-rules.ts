// Refund eligibility (docs/08 §7, ADR-043). Pure: the service gathers the facts. Every rule has a
// test in refund-rules.test.ts.

export const DEFAULT_CONSUMPTION_THRESHOLD_PCT = 30
/** More approved refunds than this in 90 days sends the next request to finance. */
export const DEFAULT_ABUSE_LIMIT = 3
export const ABUSE_WINDOW_DAYS = 90

export type NonRefundableReason =
  | 'no_refund_policy'
  | 'important_download'
  | 'content_consumed'
  | 'exam_started'
  | 'certificate_issued'

export interface RefundFacts {
  netPriceKobo: bigint
  policyDays: number
  refundableUntil: Date | null
  itemStatus: 'active' | 'non_refundable' | 'refunded' | 'refund_pending'
  nonRefundableReason: NonRefundableReason | null
  /** Share of the course's video the buyer has watched, 0–100. */
  watchedPct: number
  thresholdPct: number
  /** The important file they downloaded, for the message. */
  importantResource: string | null
  /** Refunds approved for this person in the last 90 days. */
  recentRefunds: number
  abuseLimit: number
  now: Date
}

export type DenyCode =
  | 'NOTHING_TO_REFUND'
  | 'NO_REFUND_POLICY'
  | 'REFUND_WINDOW_CLOSED'
  | 'CONTENT_CONSUMED'
  | 'IMPORTANT_RESOURCE_DOWNLOADED'
  | 'CERTIFICATE_ISSUED'
  | 'EXAM_STARTED'
  | 'REFUND_ALREADY_REQUESTED'

export type Eligibility =
  | { decision: 'approve'; code: null; details: Record<string, string> }
  | { decision: 'review'; code: 'REVIEW_REQUIRED'; details: Record<string, string> }
  | { decision: 'deny'; code: DenyCode; details: Record<string, string> }

const lagosDate = (d: Date) =>
  new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)

const deny = (code: DenyCode, details: Record<string, string> = {}): Eligibility => ({
  decision: 'deny',
  code,
  details,
})

const byReason: Readonly<Record<NonRefundableReason, DenyCode>> = {
  no_refund_policy: 'NO_REFUND_POLICY',
  important_download: 'IMPORTANT_RESOURCE_DOWNLOADED',
  content_consumed: 'CONTENT_CONSUMED',
  exam_started: 'EXAM_STARTED',
  certificate_issued: 'CERTIFICATE_ISSUED',
}

/** The first rule that says no wins; the abuse check sends the rest to finance. */
export function refundEligibility(f: RefundFacts): Eligibility {
  const pct = String(Math.round(f.watchedPct))
  if (f.itemStatus === 'refunded' || f.itemStatus === 'refund_pending') {
    return deny('REFUND_ALREADY_REQUESTED')
  }
  if (f.netPriceKobo <= 0n) return deny('NOTHING_TO_REFUND')
  if (f.policyDays === 0) return deny('NO_REFUND_POLICY')
  const consumed = f.itemStatus === 'non_refundable' ? f.nonRefundableReason : null
  if (consumed) {
    const code = byReason[consumed]
    return deny(code, {
      pct,
      resource: f.importantResource ?? 'the main file',
      n: String(f.policyDays),
    })
  }
  if (f.watchedPct >= f.thresholdPct) return deny('CONTENT_CONSUMED', { pct })
  if (!f.refundableUntil || f.now > f.refundableUntil) {
    return deny('REFUND_WINDOW_CLOSED', {
      n: String(f.policyDays),
      date: f.refundableUntil ? lagosDate(f.refundableUntil) : '',
    })
  }
  if (f.recentRefunds >= f.abuseLimit) {
    return {
      decision: 'review',
      code: 'REVIEW_REQUIRED',
      details: { recent: String(f.recentRefunds) },
    }
  }
  return { decision: 'approve', code: null, details: {} }
}
