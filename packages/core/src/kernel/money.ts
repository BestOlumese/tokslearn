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

/** Basis points in a whole (100%). */
export const BPS = 10_000n

/**
 * Splits `total` kobo in proportion to `weights` with the largest remainder method (docs/08 §1):
 * every part is floor(total × w / Σw), then the leftover kobo go one each to the parts with the
 * largest remainders (earlier parts win ties). The parts always sum to `total`. All-zero weights
 * split evenly. `total` and weights must be ≥ 0.
 */
export function allocate(total: bigint, weights: ReadonlyArray<bigint>): bigint[] {
  if (total < 0n) throw new RangeError('allocate: total must be >= 0')
  if (weights.length === 0) {
    if (total === 0n) return []
    throw new RangeError('allocate: no weights to allocate a non-zero total to')
  }
  if (weights.some((w) => w < 0n)) throw new RangeError('allocate: weights must be >= 0')
  const sum = weights.reduce((a, w) => a + w, 0n)
  const ws = sum === 0n ? weights.map(() => 1n) : weights
  const denom = sum === 0n ? BigInt(weights.length) : sum
  const parts = ws.map((w) => (total * w) / denom)
  const remainders = ws.map((w, i) => ({ i, r: (total * w) % denom }))
  let left = total - parts.reduce((a, p) => a + p, 0n)
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1))
  for (const { i } of remainders) {
    if (left === 0n) break
    parts[i] = (parts[i] ?? 0n) + 1n
    left -= 1n
  }
  return parts
}

/**
 * Splits `amount` into [share at `bps`, the rest], rounding the share half-up. The two always sum
 * to `amount`. Used for platform commission: `splitBps(net, 4000n)` → [platform, instructor].
 */
export function splitBps(amount: bigint, bps: bigint): [bigint, bigint] {
  if (bps < 0n || bps > BPS) throw new RangeError('splitBps: bps must be between 0 and 10000')
  const share = percentOf(ngn(amount), bps).amount
  return [share, amount - share]
}
