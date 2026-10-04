import { type Db, newId, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { insertUser, testUser } from '../kernel/testing'
import {
  balances,
  checkLedgerIntegrity,
  instructorAccount,
  platformAccounts as P,
  post,
} from '../ledger'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  addToCart,
  approvePayoutRun,
  completeOrder,
  cosignPayoutRun,
  draftPayoutRun,
  duePayoutRuns,
  earningLines,
  earningsSummary,
  getPayoutRun,
  listMyPayouts,
  listPayoutRuns,
  payoutRunCsv,
  preparePayoutRun,
  releaseEarnings,
  retryPayoutItem,
  sendPayoutBatch,
  setPayoutItemHold,
  settlePayoutTransfer,
  settleSentPayouts,
  startCheckout,
} from '.'

afterAll(closeTestDb)

const PAID = new Date('2026-09-10T10:00:00Z')
const DAY = 86_400_000
const at = (days: number) => new Date(PAID.getTime() + days * DAY)
const OCT1 = new Date('2026-10-01T05:00:00Z')
/** 5 October 2026 is a Monday: transfers start at 09:00 Lagos. */
const PAYDAY = new Date('2026-10-05T08:00:00Z')

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  let n = 0
  const sell = async () => {
    n++
    const buyerId = await insertUser(db, { name: `Buyer ${n}`, email: `buyer${n}@example.com` })
    const c = env.ctx(testUser(['learner'], { userId: buyerId }), PAID)
    await addToCart(c, { itemType: 'course', itemId: course.id })
    const s = await startCheckout(c, {
      expectedTotalKobo: 1_500_000n,
      idempotencyKey: `sell-${n}-xxxx`,
      anonymousId: null,
    })
    await completeOrder(c, { reference: s.publicId, via: 'confirm', userId: buyerId })
    await db.update(schema.orders).set({ paidAt: PAID }).where(eq(schema.orders.id, s.orderId))
    await db
      .update(schema.orderItems)
      .set({ refundableUntil: at(7) })
      .where(eq(schema.orderItems.orderId, s.orderId))
  }
  /** Verified identity, an active bank account and 2FA: everything a payout needs. */
  const makePayable = async () => {
    await db.insert(schema.kycChecks).values({
      userId: owner.userId,
      method: 'bvn',
      status: 'verified',
      matchedName: 'TOBI ADELEKE',
      verifiedAt: PAID,
      createdAt: PAID,
    })
    await db.insert(schema.payoutAccounts).values({
      userId: owner.userId,
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
      accountNumberLast4: '4821',
      accountName: 'TOBI ADELEKE',
      paystackRecipientCode: 'RCP_tobi',
      status: 'active',
      payoutsAllowedFrom: PAID,
    })
    await db
      .update(schema.user)
      .set({ twoFactorEnabled: true })
      .where(eq(schema.user.id, owner.userId))
  }
  const staff = async (name: string, roles: Array<'finance' | 'super_admin'>) => {
    const id = await insertUser(db, {
      name,
      email: `${name.toLowerCase()}@tokslearn.test`,
      roles: ['learner', ...roles],
    })
    return (when: Date, verified = true) =>
      env.ctx(
        testUser(['learner', ...roles], {
          userId: id,
          twoFactorVerifiedAt: verified ? new Date(when.getTime() - 60_000) : null,
        }),
        when,
      )
  }
  const job = (when: Date) => env.ctx({ kind: 'system', reason: 'payouts' }, when)
  const money = async (when: Date) => {
    const codes = [
      instructorAccount(owner.userId, 'available'),
      instructorAccount(owner.userId, 'in_transit'),
      instructorAccount(owner.userId, 'receivable'),
      P.cashPaystack,
      P.gatewayFees,
    ]
    const b = await balances(job(when), codes)
    return {
      available: b.get(codes[0] ?? '') ?? 0n,
      inTransit: b.get(codes[1] ?? '') ?? 0n,
      receivable: b.get(codes[2] ?? '') ?? 0n,
      cash: b.get(codes[3] ?? '') ?? 0n,
      fees: b.get(codes[4] ?? '') ?? 0n,
    }
  }
  const outboxEmails = async (id: string) =>
    (await db.select().from(schema.outbox))
      .map((o) => o.payload as { id?: string; to?: string })
      .filter((p) => p.id === id)
  return { env, owner, sell, makePayable, staff, job, money, outboxEmails }
}

/** Two ₦15,000 sales released: ₦17,610 available. */
const SHARE = 1_761_000n

describe('payout runs', () => {
  it('drafts, is approved with 2FA, sends, settles and marks the sales paid', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await w.sell()
      await w.sell()
      await w.makePayable()
      await releaseEarnings(w.job(at(8)))
      const finance = await w.staff('Funke', ['finance'])

      const draft = await draftPayoutRun(w.job(OCT1))
      expect(draft).toMatchObject({ publicId: 'PR-2026-10', created: true })
      expect(await draftPayoutRun(w.job(OCT1))).toMatchObject({ created: false })
      const run = await getPayoutRun(finance(OCT1), 'PR-2026-10')
      expect(run).toMatchObject({ status: 'draft', totalKobo: SHARE, cosignRequired: false })
      expect(run.payOn.toISOString()).toBe(PAYDAY.toISOString())
      expect(run.items).toEqual([
        expect.objectContaining({
          amountKobo: SHARE,
          status: 'queued',
          anomalies: ['first_payout'],
          bankName: 'Guaranty Trust Bank',
          last4: '4821',
        }),
      ])
      expect(await w.outboxEmails('staff-payout-run-ready')).toEqual([
        expect.objectContaining({ to: 'funke@tokslearn.test' }),
      ])

      // Instructors don't see a draft: nothing is decided yet.
      expect(await listMyPayouts(w.env.ctx(w.owner, OCT1))).toEqual([])

      // Approval needs a 2FA code from the last 12 hours.
      expect(await codeOf(approvePayoutRun(finance(OCT1, false), 'PR-2026-10'))).toBe(
        'STEP_UP_REQUIRED',
      )
      const learner = w.env.ctx(testUser(['learner'], { userId: w.owner.userId }), OCT1)
      expect(await codeOf(approvePayoutRun(learner, 'PR-2026-10'))).toBe('STAFF_ONLY')
      expect(await approvePayoutRun(finance(OCT1), 'PR-2026-10')).toMatchObject({
        status: 'approved',
        approvedByName: 'Funke',
      })
      expect(await codeOf(approvePayoutRun(finance(OCT1), 'PR-2026-10'))).toBe('PAYOUT_RUN_LOCKED')

      // Nothing leaves before the pay day.
      expect(await duePayoutRuns(w.job(new Date('2026-10-05T07:59:00Z')))).toEqual([])
      expect(await duePayoutRuns(w.job(PAYDAY))).toEqual([draft.runId])
      const before = await w.money(PAYDAY)
      const batches = await preparePayoutRun(w.job(PAYDAY), draft.runId)
      expect(batches).toHaveLength(1)
      expect(await preparePayoutRun(w.job(PAYDAY), draft.runId)).toEqual(batches)
      expect(await w.money(PAYDAY)).toMatchObject({ available: 0n, inTransit: SHARE })

      expect(await sendPayoutBatch(w.job(PAYDAY), batches[0] ?? [])).toEqual({
        sent: 1,
        refused: 0,
      })
      const [ref] = [...w.env.payouts.transfers.keys()]
      expect(ref).toMatch(/^tlpo[0-9a-f]{32}1$/)
      expect(w.env.payouts.transfers.get(ref ?? '')).toMatchObject({
        amountKobo: SHARE,
        recipientCode: 'RCP_tobi',
      })
      expect(await settlePayoutTransfer(w.job(PAYDAY), ref ?? '')).toBe('pending')

      w.env.payouts.settleTransfer(ref ?? '', 'success')
      const later = new Date(PAYDAY.getTime() + 10 * 60_000)
      expect(await settlePayoutTransfer(w.job(later), ref ?? '')).toBe('success')
      expect(await settlePayoutTransfer(w.job(later), ref ?? '')).toBe('skipped')
      const after = await w.money(later)
      expect(after).toMatchObject({ available: 0n, inTransit: 0n })
      // Cash pays the instructor and Paystack's ₦25 fee, which is the platform's cost.
      expect(before.cash - after.cash).toBe(SHARE + 2_500n)
      expect(after.fees - before.fees).toBe(2_500n)
      expect((await checkLedgerIntegrity(w.job(later))).ok).toBe(true)

      const done = await getPayoutRun(finance(later), 'PR-2026-10')
      expect(done).toMatchObject({ status: 'completed' })
      expect(done.items[0]).toMatchObject({ status: 'success', feeKobo: 2_500n })
      const me = w.env.ctx(w.owner, later)
      expect((await earningLines(me, { status: 'paid' })).items).toHaveLength(2)
      expect((await earningsSummary(me)).paidThisYearKobo).toBe(SHARE)
      expect(await listMyPayouts(me)).toEqual([
        expect.objectContaining({
          label: 'October 2026',
          amountKobo: SHARE,
          status: 'paid',
          last4: '4821',
        }),
      ])
      expect(await w.outboxEmails('payout-sent')).toHaveLength(1)
      const notices = await db.select().from(schema.notifications)
      expect(notices.map((x) => x.type)).toContain('payout.sent')
    })
  })

  it('puts the money back when Paystack refuses or the bank fails, and rolls it over', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await w.sell()
      await w.sell()
      await w.makePayable()
      await releaseEarnings(w.job(at(8)))
      const finance = await w.staff('Funke', ['finance'])
      const { runId } = await draftPayoutRun(w.job(OCT1))
      await approvePayoutRun(finance(OCT1), 'PR-2026-10')

      // Our Paystack balance is too low: nothing is sent, and the instructor isn't blamed.
      w.env.payouts.setTransfersDown('Your balance is not enough to fulfil this request')
      const [batch] = await preparePayoutRun(w.job(PAYDAY), runId)
      expect(await sendPayoutBatch(w.job(PAYDAY), batch ?? [])).toEqual({ sent: 0, refused: 1 })
      expect(await w.money(PAYDAY)).toMatchObject({ available: SHARE, inTransit: 0n })
      let run = await getPayoutRun(finance(PAYDAY), 'PR-2026-10')
      expect(run).toMatchObject({
        status: 'partially_failed',
        lastError: expect.stringContaining('balance is not enough'),
      })
      expect(run.items[0]).toMatchObject({ status: 'failed', attempt: 1 })
      expect(await w.outboxEmails('payout-failed')).toHaveLength(0)

      // Finance tops up and retries: a new reference, a second attempt.
      w.env.payouts.setTransfersDown(null)
      const itemId = run.items[0]?.id ?? ''
      expect(
        await codeOf(retryPayoutItem(finance(PAYDAY, false), { runId: 'PR-2026-10', itemId })),
      ).toBe('STEP_UP_REQUIRED')
      await retryPayoutItem(finance(PAYDAY), { runId: 'PR-2026-10', itemId })
      expect(await codeOf(retryPayoutItem(finance(PAYDAY), { runId: 'PR-2026-10', itemId }))).toBe(
        'PAYOUT_NOT_RETRYABLE',
      )
      const [again] = await preparePayoutRun(w.job(PAYDAY), runId)
      await sendPayoutBatch(w.job(PAYDAY), again ?? [])
      const [ref] = [...w.env.payouts.transfers.keys()]
      expect(ref).toMatch(/2$/)

      // The bank bounces it: back to available, the instructor hears what to fix.
      w.env.payouts.settleTransfer(ref ?? '', 'failed', 'Account closed')
      const later = new Date(PAYDAY.getTime() + 2 * 60 * 60_000)
      expect(await settleSentPayouts(w.job(later), { olderThanMs: 60 * 60_000 })).toEqual({
        checked: 1,
        settled: 1,
      })
      expect(await w.money(later)).toMatchObject({ available: SHARE, inTransit: 0n })
      run = await getPayoutRun(finance(later), 'PR-2026-10')
      expect(run.items[0]).toMatchObject({ status: 'failed', failureReason: 'Account closed' })
      expect(await w.outboxEmails('payout-failed')).toHaveLength(1)
      expect((await checkLedgerIntegrity(w.job(later))).ok).toBe(true)

      // Next month's draft picks the money up again.
      const nov = await draftPayoutRun(w.job(new Date('2026-11-01T05:00:00Z')))
      const next = await getPayoutRun(finance(new Date('2026-11-01T06:00:00Z')), nov.publicId)
      expect(next.items).toEqual([expect.objectContaining({ amountKobo: SHARE, status: 'queued' })])
    })
  })

  it('holds who can’t be paid, nets refunds owed back, and needs a co-sign over the limit', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await w.sell()
      await w.sell()
      await releaseEarnings(w.job(at(8)))
      const finance = await w.staff('Funke', ['finance'])
      const boss = await w.staff('Ngozi', ['super_admin'])

      // No bank account, identity or 2FA yet: held, and there's nothing to approve.
      await draftPayoutRun(w.job(OCT1))
      let run = await getPayoutRun(finance(OCT1), 'PR-2026-10')
      expect(run.items[0]).toMatchObject({ status: 'held', holdReason: 'no_payout_account' })
      expect(run.totalKobo).toBe(0n)
      expect(await codeOf(approvePayoutRun(finance(OCT1), 'PR-2026-10'))).toBe('PAYOUT_RUN_EMPTY')

      // Fixed, plus ₦1,000 owed back from a refund after an earlier payout; finance rebuilds.
      await w.makePayable()
      await post(w.job(OCT1), {
        kind: 'chargeback',
        ref: { type: 'test', id: newId() },
        idempotencyKey: 'test-owed',
        lines: [
          { account: instructorAccount(w.owner.userId, 'receivable'), debit: 100_000n },
          { account: P.cashPaystack, credit: 100_000n },
        ],
      })
      await db
        .insert(schema.settings)
        .values({ key: 'payout_cosign_threshold_kobo', value: '1000000' })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: sql`excluded.value` } })
      await draftPayoutRun(finance(OCT1))
      run = await getPayoutRun(finance(OCT1), 'PR-2026-10')
      expect(run).toMatchObject({ totalKobo: SHARE - 100_000n, cosignRequired: true })
      const itemId = run.items[0]?.id ?? ''

      // Finance can hold someone back, and the hold survives a rebuild.
      await setPayoutItemHold(finance(OCT1), { runId: 'PR-2026-10', itemId, hold: true })
      await draftPayoutRun(finance(OCT1))
      run = await getPayoutRun(finance(OCT1), 'PR-2026-10')
      expect(run.items[0]).toMatchObject({ status: 'held', holdReason: 'finance_hold' })
      await setPayoutItemHold(finance(OCT1), {
        runId: 'PR-2026-10',
        itemId: run.items[0]?.id ?? '',
        hold: false,
      })

      // Over the limit: finance approves, a different super admin co-signs.
      run = await approvePayoutRun(finance(OCT1), 'PR-2026-10')
      expect(run).toMatchObject({ status: 'draft', approvedByName: 'Funke' })
      expect(await duePayoutRuns(w.job(PAYDAY))).toEqual([])
      expect(await codeOf(cosignPayoutRun(finance(OCT1), 'PR-2026-10'))).toBe('STAFF_ONLY')
      expect(await codeOf(draftPayoutRun(finance(OCT1)))).toBe('PAYOUT_RUN_LOCKED')
      run = await cosignPayoutRun(boss(OCT1), 'PR-2026-10')
      expect(run).toMatchObject({ status: 'approved', cosignedByName: 'Ngozi' })

      // Sending takes the ₦1,000 owed first, then pays the rest.
      const [batch] = await preparePayoutRun(w.job(PAYDAY), run.id)
      expect(await w.money(PAYDAY)).toMatchObject({
        available: 0n,
        receivable: 0n,
        inTransit: SHARE - 100_000n,
      })
      await sendPayoutBatch(w.job(PAYDAY), batch ?? [])
      const [ref] = [...w.env.payouts.transfers.keys()]
      w.env.payouts.settleTransfer(ref ?? '', 'success')
      await settlePayoutTransfer(w.job(PAYDAY), ref ?? '')
      // Both sales are covered (the payout plus what was netted).
      const me = w.env.ctx(w.owner, PAYDAY)
      expect((await earningLines(me, { status: 'paid' })).items).toHaveLength(2)

      // Paystack later reverses it: the money and the sales come back.
      w.env.payouts.settleTransfer(ref ?? '', 'reversed', 'Beneficiary bank declined')
      expect(await settlePayoutTransfer(w.job(PAYDAY), ref ?? '')).toBe('reversed')
      expect(await w.money(PAYDAY)).toMatchObject({ available: SHARE - 100_000n, inTransit: 0n })
      expect((await earningLines(me, { status: 'paid' })).items).toHaveLength(0)
      expect((await checkLedgerIntegrity(w.job(PAYDAY))).ok).toBe(true)

      // The approver can't also co-sign.
      const solo = await w.staff('Ada', ['super_admin'])
      await db.delete(schema.payoutItems)
      await db.delete(schema.payoutRuns)
      await draftPayoutRun(solo(OCT1))
      await approvePayoutRun(solo(OCT1), 'PR-2026-10')
      expect(await codeOf(cosignPayoutRun(solo(OCT1), 'PR-2026-10'))).toBe('PAYOUT_COSIGN_SELF')
    })
  })

  it('never pays twice after a timeout, skips a holiday, and lists and exports runs', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await w.sell()
      await w.sell()
      await w.makePayable()
      await releaseEarnings(w.job(at(8)))
      await db
        .insert(schema.settings)
        .values({ key: 'public_holidays', value: ['2026-10-05'] })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: sql`excluded.value` } })
      const finance = await w.staff('Funke', ['finance'])
      const { runId } = await draftPayoutRun(w.job(OCT1))
      const tuesday = new Date('2026-10-06T08:00:00Z')
      expect((await getPayoutRun(finance(OCT1), 'PR-2026-10')).payOn).toEqual(tuesday)
      await approvePayoutRun(finance(OCT1), 'PR-2026-10')
      expect(await duePayoutRuns(w.job(PAYDAY))).toEqual([])

      // Paystack queues the transfer but our call times out: the job step fails and retries.
      const [batch] = await preparePayoutRun(w.job(tuesday), runId)
      w.env.payouts.timeOutAfterAccepting()
      expect(await codeOfThrow(sendPayoutBatch(w.job(tuesday), batch ?? []))).toBe('timed out')
      // The retry asks Paystack first and finds it: no second transfer.
      expect(await sendPayoutBatch(w.job(tuesday), batch ?? [])).toEqual({ sent: 1, refused: 0 })
      expect(w.env.payouts.transfers.size).toBe(1)

      const [summary] = await listPayoutRuns(finance(tuesday))
      expect(summary).toMatchObject({ publicId: 'PR-2026-10', status: 'processing' })
      expect(summary?.counts).toMatchObject({ sent: 1, queued: 0 })
      const csv = await payoutRunCsv(finance(tuesday), 'PR-2026-10')
      expect(csv.filename).toBe('tokslearn-payouts-2026-10.csv')
      expect(csv.csv.split('\n')[1]).toContain(',Guaranty Trust Bank,4821,17610.00,0.00,sent,')
      expect(await codeOf(getPayoutRun(finance(tuesday), 'PR-2026-09'))).toBe(
        'PAYOUT_RUN_NOT_FOUND',
      )
    })
  })
})

const codeOfThrow = async (p: Promise<unknown>) => {
  try {
    await p
    return null
  } catch (e) {
    return e instanceof Error ? e.message.replace(/^paystack: /, '') : String(e)
  }
}
