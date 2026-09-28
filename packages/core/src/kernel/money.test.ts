import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addMoney, allocate, fromMoneyDto, ngn, percentOf, splitBps, toMoneyDto } from './money'

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

describe('allocate (largest remainder)', () => {
  it('splits odd amounts so the parts add up', () => {
    expect(allocate(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n])
    expect(allocate(1n, [1n, 1n])).toEqual([1n, 0n])
    // ₦20,000 bundle over courses listed at ₦15,000 and ₦10,000.
    expect(allocate(2_000_000n, [1_500_000n, 1_000_000n])).toEqual([1_200_000n, 800_000n])
    expect(allocate(10n, [3n, 3n, 3n])).toEqual([4n, 3n, 3n])
  })

  it('gives leftovers to the largest remainders, ties to earlier parts', () => {
    // 7 × (1,2,4)/7 = 1,2,4 exactly; 8 → remainders 1/7,2/7,4/7 → last part gets the kobo.
    expect(allocate(8n, [1n, 2n, 4n])).toEqual([1n, 2n, 5n])
  })

  it('handles zeros, an empty list and bad input', () => {
    expect(allocate(0n, [5n, 5n])).toEqual([0n, 0n])
    expect(allocate(5n, [0n, 0n])).toEqual([3n, 2n])
    expect(allocate(7n, [0n, 3n])).toEqual([0n, 7n])
    expect(allocate(0n, [])).toEqual([])
    expect(() => allocate(1n, [])).toThrow(RangeError)
    expect(() => allocate(-1n, [1n])).toThrow(RangeError)
    expect(() => allocate(1n, [1n, -1n])).toThrow(RangeError)
  })

  it('always sums to the total and never goes negative (property)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.array(fc.bigInt({ min: 0n, max: 10n ** 12n }), { minLength: 1, maxLength: 20 }),
        (total, weights) => {
          const parts = allocate(total, weights)
          expect(parts).toHaveLength(weights.length)
          expect(parts.reduce((a, p) => a + p, 0n)).toBe(total)
          for (const p of parts) expect(p >= 0n).toBe(true)
        },
      ),
      { numRuns: 2000 },
    )
  })

  it('stays within one kobo of the exact share (property)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.array(fc.bigInt({ min: 1n, max: 10n ** 9n }), { minLength: 1, maxLength: 10 }),
        (total, weights) => {
          const sum = weights.reduce((a, w) => a + w, 0n)
          allocate(total, weights).forEach((p, i) => {
            const floor = (total * (weights[i] ?? 0n)) / sum
            expect(p === floor || p === floor + 1n).toBe(true)
          })
        },
      ),
      { numRuns: 1000 },
    )
  })
})

describe('splitBps', () => {
  it('matches the docs/08 §5 example and always sums', () => {
    // 40% of ₦10,000 → ₦4,000 platform, ₦6,000 instructor.
    expect(splitBps(1_000_000n, 4_000n)).toEqual([400_000n, 600_000n])
    expect(splitBps(1n, 5_000n)).toEqual([1n, 0n])
    expect(splitBps(999n, 0n)).toEqual([0n, 999n])
    expect(splitBps(999n, 10_000n)).toEqual([999n, 0n])
    expect(() => splitBps(1n, 10_001n)).toThrow(RangeError)
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.bigInt({ min: 0n, max: 10_000n }),
        (amount, bps) => {
          const [a, b] = splitBps(amount, bps)
          expect(a + b).toBe(amount)
          expect(a >= 0n && b >= 0n).toBe(true)
        },
      ),
    )
  })
})
