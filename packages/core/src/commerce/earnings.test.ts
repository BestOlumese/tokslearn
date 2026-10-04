import { describe, expect, it } from 'vitest'
import { monthRange, nextPayoutDate, previousMonth } from './earnings'

const at = (iso: string) => new Date(iso)
const day = (d: Date) => d.toISOString().slice(0, 10)

describe('payout dates (ADR-019)', () => {
  it('pays on the 5th, or the next working day after a weekend or holiday', () => {
    expect(day(nextPayoutDate(at('2026-10-03T10:00:00Z'), 5, new Set()))).toBe('2026-10-05')
    // 5 Sept 2026 is a Saturday.
    expect(day(nextPayoutDate(at('2026-09-01T10:00:00Z'), 5, new Set()))).toBe('2026-09-07')
    expect(day(nextPayoutDate(at('2026-10-03T10:00:00Z'), 5, new Set(['2026-10-05'])))).toBe(
      '2026-10-06',
    )
  })

  it('moves to next month once this month’s payout day has passed (Lagos time)', () => {
    expect(day(nextPayoutDate(at('2026-10-06T10:00:00Z'), 5, new Set()))).toBe('2026-11-05')
    // 23:30 UTC on 5 Oct is already 6 Oct in Lagos.
    expect(day(nextPayoutDate(at('2026-10-05T23:30:00Z'), 5, new Set()))).toBe('2026-11-05')
  })

  it('works out Lagos months for statements', () => {
    expect(previousMonth(at('2026-10-01T05:00:00Z'))).toBe('2026-09')
    expect(previousMonth(at('2026-01-01T05:00:00Z'))).toBe('2025-12')
    expect(monthRange('2026-09')).toEqual({
      from: at('2026-08-31T23:00:00Z'),
      to: at('2026-09-30T23:00:00Z'),
    })
  })
})
