import { type Db, newId, schema } from '@tokslearn/db'
import { closeTestDb, getTestDb, withRollback } from '@tokslearn/db/testing'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { systemActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'
import { insertUser } from '../kernel/testing'
import {
  balances,
  checkLedgerIntegrity,
  entriesFor,
  instructorAccount,
  LedgerError,
  listEntries,
  platformAccounts as P,
  post,
} from '.'

afterAll(closeTestDb)

/** Drizzle wraps the database error; the trigger's message is on `cause`. */
const appendOnly = (e: unknown) =>
  /append-only/.test(String((e as { cause?: { message?: string } }).cause?.message))

const ctxFor = (db: Db) => createCtx({ db, actor: systemActor('ledger-test'), requestId: 'test' })

/** docs/08 §5 worked example: ₦10,000 organic sale, ₦250 Paystack fee, proportional fees. */
async function sale(db: Db, instructorId: string, orderId = newId()) {
  return post(ctxFor(db), {
    kind: 'sale',
    ref: { type: 'order', id: orderId },
    idempotencyKey: `sale:${orderId}`,
    lines: [
      { account: P.cashPaystack, debit: 975_000n },
      { account: P.gatewayFees, debit: 25_000n },
      { account: instructorAccount(instructorId, 'pending'), credit: 585_000n },
      { account: P.revenue, credit: 415_000n },
    ],
  })
}

describe('ledger', () => {
  it('posts the worked sale example with the right balances and lines', async () => {
    await withRollback(async (db) => {
      const x = await insertUser(db, { roles: ['learner', 'instructor'] })
      const orderId = newId()
      const before = await balances(ctxFor(db), [P.cashPaystack, P.revenue, P.gatewayFees])
      const posted = await sale(db, x, orderId)
      expect(posted.created).toBe(true)
      expect(posted.publicId).toMatch(/^JE-/)

      const after = await balances(ctxFor(db), [
        P.cashPaystack,
        P.revenue,
        P.gatewayFees,
        instructorAccount(x, 'pending'),
      ])
      const delta = (code: string) => (after.get(code) ?? 0n) - (before.get(code) ?? 0n)
      expect(delta(P.cashPaystack)).toBe(975_000n)
      expect(delta(P.gatewayFees)).toBe(25_000n)
      expect(delta(P.revenue)).toBe(415_000n)
      expect(after.get(instructorAccount(x, 'pending'))).toBe(585_000n)

      const [entry] = await entriesFor(ctxFor(db), { type: 'order', id: orderId })
      expect(entry?.kind).toBe('sale')
      expect(entry?.lines).toHaveLength(4)
      const sum = (dir: 'debit' | 'credit') =>
        (entry?.lines ?? [])
          .filter((l) => l.direction === dir)
          .reduce((a, l) => a + l.amountKobo, 0n)
      expect(sum('debit')).toBe(sum('credit'))
    })
  })

  it('returns the existing entry for a repeated idempotency key without moving money', async () => {
    await withRollback(async (db) => {
      const x = await insertUser(db, { roles: ['learner', 'instructor'] })
      const orderId = newId()
      const first = await sale(db, x, orderId)
      const again = await sale(db, x, orderId)
      expect(again).toEqual({ ...first, created: false })
      expect(
        (await balances(ctxFor(db), [instructorAccount(x, 'pending')])).get(
          instructorAccount(x, 'pending'),
        ),
      ).toBe(585_000n)
    })
  })

  it('runs every flow in docs/08 §12 and stays balanced', async () => {
    await withRollback(async (db) => {
      const ctx = ctxFor(db)
      const x = await insertUser(db, { roles: ['learner', 'instructor'] })
      const pending = instructorAccount(x, 'pending')
      const available = instructorAccount(x, 'available')
      const inTransit = instructorAccount(x, 'in_transit')
      const receivable = instructorAccount(x, 'receivable')
      const codes = [pending, available, inTransit, receivable]
      const start = await balances(ctx, [P.cashPaystack, P.revenue, P.gatewayFees])

      // Two sales. The first is released and paid out; the second is refunded before release.
      const o1 = newId()
      const o2 = newId()
      await sale(db, x, o1)
      await sale(db, x, o2)
      const entry = (
        kind: Parameters<typeof post>[1]['kind'],
        key: string,
        lines: Parameters<typeof post>[1]['lines'],
      ) => post(ctx, { kind, ref: { type: 'order', id: o1 }, idempotencyKey: key, lines })

      await entry('release', `release:${o1}`, [
        { account: pending, debit: 585_000n },
        { account: available, credit: 585_000n },
      ])
      // Refund before release: learner gets ₦10,000; Paystack keeps its fee (ADR-020).
      await post(ctx, {
        kind: 'refund',
        ref: { type: 'order', id: o2 },
        idempotencyKey: `refund:${o2}`,
        lines: [
          { account: pending, debit: 585_000n },
          { account: P.revenue, debit: 415_000n },
          { account: P.cashPaystack, credit: 1_000_000n },
        ],
      })
      // Payout of the released ₦5,850: initiated, then a failed transfer, then a retry that works.
      await entry('payout', 'payout:1', [
        { account: available, debit: 585_000n },
        { account: inTransit, credit: 585_000n },
      ])
      await entry('payout_reversal', 'payout-failed:1', [
        { account: inTransit, debit: 585_000n },
        { account: available, credit: 585_000n },
      ])
      await entry('payout', 'payout:2', [
        { account: available, debit: 585_000n },
        { account: inTransit, credit: 585_000n },
      ])
      await entry('payout', 'payout-success:2', [
        { account: inTransit, debit: 585_000n },
        { account: P.cashPaystack, credit: 585_000n },
      ])
      await entry('fee', 'transfer-fee:2', [
        { account: P.gatewayFees, debit: 1_000n },
        { account: P.cashPaystack, credit: 1_000n },
      ])
      // Chargeback after payout: the instructor owes their share back.
      await entry('chargeback', 'chargeback:1', [
        { account: receivable, debit: 585_000n },
        { account: P.revenue, debit: 415_000n },
        { account: P.cashPaystack, credit: 1_000_000n },
      ])

      const end = await balances(ctx, [...codes, P.cashPaystack, P.revenue, P.gatewayFees])
      expect(codes.map((c) => end.get(c))).toEqual([0n, 0n, 0n, 585_000n])
      const d = (c: string) => (end.get(c) ?? 0n) - (start.get(c) ?? 0n)
      // Cash: +9,750 +9,750 −10,000 −5,850 −10 −10,000 = −6,360 (₦).
      expect(d(P.cashPaystack)).toBe(-636_000n)
      // Revenue: +4,150 +4,150 −4,150 −4,150 = 0. Fees: 250 + 250 + 10.
      expect(d(P.revenue)).toBe(0n)
      expect(d(P.gatewayFees)).toBe(51_000n)

      const report = await checkLedgerIntegrity(ctx)
      expect(report).toEqual({ ok: true, unbalancedEntries: [], balanceMismatches: [] })
      const page = await listEntries(ctx, { limit: 3 })
      expect(page.items).toHaveLength(3)
      expect(page.nextCursor).not.toBeNull()
      const next = await listEntries(ctx, { limit: 3, cursor: page.nextCursor ?? undefined })
      expect(next.items[0]?.id).not.toBe(page.items[0]?.id)
      expect(
        (await listEntries(ctx, { kind: 'chargeback', limit: 10 })).items.every(
          (e) => e.kind === 'chargeback',
        ),
      ).toBe(true)
    })
  })

  it('refuses bad entries before writing anything, and never lets lines change', async () => {
    await withRollback(async (db) => {
      const ctx = ctxFor(db)
      await expect(
        post(ctx, {
          kind: 'adjustment',
          ref: { type: 'test', id: newId() },
          idempotencyKey: `bad:${newId()}`,
          lines: [
            { account: P.cashPaystack, debit: 100n },
            { account: P.revenue, credit: 99n },
          ],
        }),
      ).rejects.toBeInstanceOf(LedgerError)

      const x = await insertUser(db, { roles: ['learner', 'instructor'] })
      await sale(db, x)
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`update ${schema.journalLines} set amount_kobo = amount_kobo + 1`)
        }),
      ).rejects.toSatisfy(appendOnly)
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`delete from ${schema.journalEntries}`)
        }),
      ).rejects.toSatisfy(appendOnly)
    })
  })

  it('writes one entry when three posts with the same key race (real transactions)', async () => {
    const db = await getTestDb()
    const x = await insertUser(db, {
      roles: ['learner', 'instructor'],
      email: `ledger-race-${newId()}@example.test`,
    })
    const orderId = newId()
    const results = await Promise.all([
      sale(db, x, orderId),
      sale(db, x, orderId),
      sale(db, x, orderId),
    ])
    expect(results.filter((r) => r.created)).toHaveLength(1)
    expect(new Set(results.map((r) => r.entryId)).size).toBe(1)
    expect(await entriesFor(ctxFor(db), { type: 'order', id: orderId })).toHaveLength(1)
    expect(
      (await balances(ctxFor(db), [instructorAccount(x, 'pending')])).get(
        instructorAccount(x, 'pending'),
      ),
    ).toBe(585_000n)
  })
})
