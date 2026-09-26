import type { MoneyDto } from '@tokslearn/contract'

/** Money inside core: integer kobo as bigint (CLAUDE.md §1.4). */
export interface Money {
  amount: bigint
  currency: 'NGN'
}

export const ngn = (kobo: bigint): Money => ({ amount: kobo, currency: 'NGN' })

export const addMoney = (a: Money, b: Money): Money => ngn(a.amount + b.amount)
export const subtractMoney = (a: Money, b: Money): Money => ngn(a.amount - b.amount)

/** Basis points avoid floats for percentages: 40% = 4000 bps. Rounds half away from zero. */
export function percentOf(m: Money, bps: bigint): Money {
  const scaled = m.amount * bps
  const q = scaled / 10_000n
  const r = scaled % 10_000n
  const absR = r < 0n ? -r : r
  const roundUp = absR * 2n >= 10_000n
  if (!roundUp) return ngn(q)
  return ngn(scaled < 0n ? q - 1n : q + 1n)
}

export const toMoneyDto = (m: Money): MoneyDto => ({ amount: m.amount.toString(), currency: 'NGN' })
export const fromMoneyDto = (dto: MoneyDto): Money => ngn(BigInt(dto.amount))
