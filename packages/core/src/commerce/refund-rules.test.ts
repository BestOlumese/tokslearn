import { describe, expect, it } from 'vitest'
import { type RefundFacts, refundEligibility } from './refund-rules'

const now = new Date('2026-10-05T10:00:00Z')
const base: RefundFacts = {
  netPriceKobo: 1_500_000n,
  policyDays: 7,
  refundableUntil: new Date('2026-10-08T10:00:00Z'),
  itemStatus: 'active',
  nonRefundableReason: null,
  watchedPct: 12,
  thresholdPct: 30,
  importantResource: null,
  recentRefunds: 0,
  abuseLimit: 3,
  now,
}
const code = (f: Partial<RefundFacts>) => refundEligibility({ ...base, ...f }).code

describe('refund eligibility (docs/08 §7)', () => {
  it('approves inside the window with little watched', () => {
    expect(refundEligibility(base)).toEqual({ decision: 'approve', code: null, details: {} })
  })

  it('denies a course without a refund policy', () => {
    expect(code({ policyDays: 0 })).toBe('NO_REFUND_POLICY')
  })

  it('denies after the window, naming the day it ended', () => {
    const r = refundEligibility({ ...base, now: new Date('2026-10-08T10:00:01Z') })
    expect(r).toEqual({
      decision: 'deny',
      code: 'REFUND_WINDOW_CLOSED',
      details: { n: '7', date: '8 October 2026' },
    })
  })

  it('denies once the threshold is watched, even before the purchase was marked', () => {
    expect(refundEligibility({ ...base, watchedPct: 30.4 })).toMatchObject({
      code: 'CONTENT_CONSUMED',
      details: { pct: '30' },
    })
  })

  it('denies with the reason recorded when the purchase became non-refundable', () => {
    const marked = (reason: RefundFacts['nonRefundableReason']) =>
      code({ itemStatus: 'non_refundable', nonRefundableReason: reason })
    expect(marked('important_download')).toBe('IMPORTANT_RESOURCE_DOWNLOADED')
    expect(marked('content_consumed')).toBe('CONTENT_CONSUMED')
    expect(marked('certificate_issued')).toBe('CERTIFICATE_ISSUED')
    expect(marked('exam_started')).toBe('EXAM_STARTED')
    expect(marked('no_refund_policy')).toBe('NO_REFUND_POLICY')
    expect(
      refundEligibility({
        ...base,
        itemStatus: 'non_refundable',
        nonRefundableReason: 'important_download',
        importantResource: 'March workbook',
      }).details.resource,
    ).toBe('March workbook')
  })

  it('sends frequent refunders to finance instead of denying', () => {
    expect(refundEligibility({ ...base, recentRefunds: 3 })).toMatchObject({
      decision: 'review',
      code: 'REVIEW_REQUIRED',
    })
    expect(code({ recentRefunds: 2 })).toBeNull()
  })

  it('has nothing to refund for a free (100% coupon) purchase, and no second request', () => {
    expect(code({ netPriceKobo: 0n })).toBe('NOTHING_TO_REFUND')
    expect(code({ itemStatus: 'refund_pending' })).toBe('REFUND_ALREADY_REQUESTED')
    expect(code({ itemStatus: 'refunded' })).toBe('REFUND_ALREADY_REQUESTED')
  })
})
