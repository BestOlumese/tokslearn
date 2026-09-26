import { z } from 'zod'

/** ISO-8601 timestamp string on the wire (docs/03 §7). */
export const IsoDateTime = z.iso.datetime({ offset: true })

/** Money on the wire: kobo as a decimal string to avoid JS number precision issues. */
export const MoneyDto = z.object({
  amount: z.string().regex(/^-?\d+$/),
  currency: z.literal('NGN'),
})
export type MoneyDto = z.infer<typeof MoneyDto>

export const Cursor = z.string().max(200)

/** Cursor pagination output `{ items, nextCursor }` (docs/06 §3.6). */
export const Page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() })

/** Header every first-party client sends: `web`, `ios@1.2.0`, `android@1.2.0` (docs/17 §1.11). */
export const CLIENT_HEADER = 'x-tokslearn-client'
/** Client-supplied idempotency key for money/irreversible mutations (docs/06 §3.5). */
export const IDEMPOTENCY_HEADER = 'idempotency-key'
