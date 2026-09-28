import { describe, expect, it } from 'vitest'
import { describeAccount, instructorAccount, isDebitNormal, platformAccounts } from './accounts'
import { LedgerError, validateLines } from './post'

const X = '01920000-0000-7000-8000-000000000201'

describe('chart of accounts', () => {
  it('knows platform and instructor accounts and their normal sides', () => {
    expect(describeAccount(platformAccounts.cashPaystack)).toEqual({ type: 'asset', ownerId: null })
    expect(describeAccount(platformAccounts.revenue)?.type).toBe('revenue')
    expect(describeAccount(platformAccounts.vatPayable)?.type).toBe('liability')
    expect(describeAccount(instructorAccount(X, 'pending'))).toEqual({
      type: 'liability',
      ownerId: X,
    })
    expect(describeAccount(instructorAccount(X, 'receivable'))?.type).toBe('asset')
    expect(describeAccount('instructor:not-a-uuid:pending')).toBeNull()
    expect(describeAccount('platform:petty_cash')).toBeNull()
    expect(isDebitNormal('asset') && isDebitNormal('expense')).toBe(true)
    expect(isDebitNormal('liability') || isDebitNormal('revenue')).toBe(false)
  })
})

describe('validateLines', () => {
  const ok = [
    { account: platformAccounts.cashPaystack, debit: 975_000n },
    { account: platformAccounts.gatewayFees, debit: 25_000n },
    { account: instructorAccount(X, 'pending'), credit: 585_000n },
    { account: platformAccounts.revenue, credit: 415_000n },
  ]

  it('accepts the docs/08 §5 sale entry', () => {
    expect(() => validateLines(ok)).not.toThrow()
  })

  it('rejects unbalanced, empty, zero, negative, mixed and unknown lines', () => {
    const bad: unknown[][] = [
      [ok[0], ok[2]],
      [ok[0]],
      [],
      [...ok, { account: platformAccounts.revenue, credit: 0n }],
      [
        { account: platformAccounts.cashPaystack, debit: -5n },
        { account: platformAccounts.revenue, credit: -5n },
      ],
      [
        { account: platformAccounts.cashPaystack, debit: 5n, credit: 5n },
        { account: platformAccounts.revenue, credit: 5n },
      ],
      [
        { account: 'platform:petty_cash', debit: 5n },
        { account: platformAccounts.revenue, credit: 5n },
      ],
      [{ account: platformAccounts.cashPaystack }, { account: platformAccounts.revenue }],
    ]
    for (const lines of bad) {
      expect(() => validateLines(lines as Parameters<typeof validateLines>[0])).toThrow(LedgerError)
    }
  })

  it('reports the LEDGER_UNBALANCED code', () => {
    try {
      validateLines([ok[0], ok[2]] as Parameters<typeof validateLines>[0])
    } catch (e) {
      expect((e as LedgerError).code).toBe('LEDGER_UNBALANCED')
    }
  })
})
