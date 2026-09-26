import { describe, expect, it } from 'vitest'
import { addMoney, fromMoneyDto, ngn, percentOf, toMoneyDto } from './money'

describe('money', () => {
  it('adds kobo exactly, beyond Number.MAX_SAFE_INTEGER', () => {
    const big = ngn(9_007_199_254_740_993n)
    expect(addMoney(big, ngn(1n)).amount).toBe(9_007_199_254_740_994n)
  })

  it('takes a percentage in basis points with half-up rounding', () => {
    // 40% of ₦150.25 = ₦60.10
    expect(percentOf(ngn(15_025n), 4_000n).amount).toBe(6_010n)
    // 3% of 1 kobo = 0.03 kobo → 0
    expect(percentOf(ngn(1n), 300n).amount).toBe(0n)
    // 50% of 1 kobo = 0.5 → 1
    expect(percentOf(ngn(1n), 5_000n).amount).toBe(1n)
  })

  it('serializes as a string and round-trips', () => {
    const dto = toMoneyDto(ngn(1_500_000n))
    expect(dto).toEqual({ amount: '1500000', currency: 'NGN' })
    expect(fromMoneyDto(dto).amount).toBe(1_500_000n)
  })
})
