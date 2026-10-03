import { type Db, schema } from '@tokslearn/db'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, setup } from '../testing'
import {
  getPreferences,
  listNotifications,
  markRead,
  type NotificationType,
  type NotificationTypeInfo,
  notificationTypeKeys,
  notificationTypes,
  notify,
  sendDigest,
  setPreference,
  unreadCount,
} from '.'

afterAll(closeTestDb)

const T0 = new Date('2026-10-03T09:00:00Z')

/** Any catalog email will do: notify only decides whether it's sent. */
const someEmail = (key: string) => ({
  id: 'mention' as const,
  businessKey: key,
  data: {
    name: 'Ada',
    courseTitle: 'Excel',
    threadTitle: 'Totals',
    authorName: 'Bola A.',
    excerpt: 'Hi',
    url: 'https://tokslearn.test/x',
  },
})

const emailsTo = async (db: Db, to: string) =>
  (
    await db
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.eventName, 'notification.email_requested'))
  )
    .map((o) => o.payload as { id: string; to: string })
    .filter((p) => p.to === to)

async function person(db: Db, n: number) {
  const email = `ada${n}@example.com`
  const userId = await insertUser(db, { name: `Ada Learner${n}`, email })
  return { userId, email, actor: testUser(['learner'], { userId }) }
}

describe('preferences', () => {
  it('are respected for every type and channel (Phase 9 acceptance)', async () => {
    await withRollback(async (db) => {
      const env = setup(db)
      const a = await person(db, 1)
      const me = env.ctx(a.actor, T0)
      // Every type, with each channel turned off in turn where allowed.
      for (const type of notificationTypeKeys) {
        const info: NotificationTypeInfo = notificationTypes[type]
        for (const off of ['email', 'in_app'] as const) {
          if (off === 'email' && info.email === 'locked') {
            expect(
              await codeOf(setPreference(me, { type, channel: 'email', enabled: false })),
            ).toBe('NOTIFICATION_LOCKED')
            continue
          }
          await setPreference(me, { type, channel: off, enabled: false })
          await setPreference(me, {
            type,
            channel: off === 'email' ? 'in_app' : 'email',
            enabled: true,
          }).catch(() => undefined)
          const key = `${type}:${off}`
          const before = (await emailsTo(db, a.email)).length
          await notify(env.ctx({ kind: 'system', reason: 'test' }, T0), {
            userId: a.userId,
            type: type as NotificationType,
            title: key,
            email: someEmail(key),
          })
          const emailed = (await emailsTo(db, a.email)).length > before
          const [row] = await db
            .select()
            .from(schema.notifications)
            .where(
              and(eq(schema.notifications.userId, a.userId), eq(schema.notifications.title, key)),
            )
          const shown = row?.inApp ?? false
          expect({ key, emailed, shown }).toEqual({
            key,
            emailed: off !== 'email',
            shown: off !== 'in_app',
          })
          // Back to the defaults (both channels) for the next round.
          await setPreference(me, { type, channel: 'in_app', enabled: info.inApp })
          if (info.email !== 'locked') {
            await setPreference(me, { type, channel: 'email', enabled: info.email === 'on' })
          }
        }
      }
      // Choices equal to the default aren't stored.
      const stored = await db
        .select()
        .from(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.userId, a.userId))
      expect(stored.filter((r) => r.channel === 'email' && r.enabled)).toEqual([])
      const prefs = await getPreferences(me)
      expect(prefs.find((p) => p.type === 'order.receipt')).toMatchObject({
        email: true,
        emailLocked: true,
      })
    })
  })
})

describe('the bell', () => {
  it('lists, counts and marks read; jobs that run twice write once', async () => {
    await withRollback(async (db) => {
      const env = setup(db)
      const a = await person(db, 2)
      const sys = env.ctx({ kind: 'system', reason: 'test' }, T0)
      for (let i = 0; i < 25; i++) {
        await notify(
          env.ctx({ kind: 'system', reason: 'test' }, new Date(T0.getTime() + i * 1000)),
          {
            userId: a.userId,
            type: 'lesson.unlocked',
            title: `Lesson ${i}`,
            link: `/learn/x/${i}`,
            dedupeKey: `unlock:${i}`,
          },
        )
      }
      await notify(sys, {
        userId: a.userId,
        type: 'lesson.unlocked',
        title: 'Again',
        dedupeKey: 'unlock:3',
      })
      // Receipts are email-only by default: not in the bell.
      await notify(sys, { userId: a.userId, type: 'order.receipt', title: 'Receipt' })
      const me = env.ctx(a.actor, T0)
      expect(await unreadCount(me)).toBe(25)
      const first = await listNotifications(me, {})
      expect(first.items).toHaveLength(20)
      expect(first.items[0]?.title).toBe('Lesson 24')
      const second = await listNotifications(me, { before: first.items[19]?.id })
      expect(second).toMatchObject({ hasMore: false })
      expect(second.items.map((i) => i.title)).toEqual([
        'Lesson 4',
        'Lesson 3',
        'Lesson 2',
        'Lesson 1',
        'Lesson 0',
      ])
      await markRead(me, { ids: [first.items[0]?.id ?? ''] })
      expect(await unreadCount(me)).toBe(24)
      // Someone else's ids do nothing.
      const b = await person(db, 3)
      await markRead(env.ctx(b.actor, T0), { ids: first.items.map((i) => i.id) })
      expect(await unreadCount(me)).toBe(24)
      await markRead(me, { all: true })
      expect(await unreadCount(me)).toBe(0)
    })
  })

  it('counts unread from the partial index (Phase 9 acceptance: EXPLAIN)', async () => {
    await withRollback(async (db) => {
      const users = await Promise.all([4, 5, 6].map((n) => person(db, n)))
      // A realistic spread: many people, most rows read.
      await db.execute(sql`
        insert into "user" (id, name, email, email_verified, created_at, updated_at)
        select gen_random_uuid(), 'Bulk ' || g, 'bulk' || g || '@example.com', true, now(), now()
        from generate_series(1, 400) g`)
      await db.execute(sql`
        insert into notifications (id, user_id, type, title, in_app, email, read_at, created_at, updated_at)
        select gen_random_uuid(), u.id, 'lesson.unlocked', 'x', true, 'none',
          case when g % 10 = 0 then null else now() end, now(), now()
        from "user" u cross join generate_series(1, 50) g`)
      await db.execute(sql`analyze notifications`)
      const me = users[0]?.userId ?? ''
      const plan = (await db.execute(sql`
        explain select count(*) from (select 1 from notifications
          where user_id = ${me} and in_app and read_at is null limit 100) unread`)) as unknown as {
        rows: Array<{ 'QUERY PLAN': string }>
      }
      const text = plan.rows.map((r) => r['QUERY PLAN']).join('\n')
      expect(text).toContain('notifications_unread_idx')
      expect(text).not.toContain('Seq Scan')
    })
  })
})

describe('digest', () => {
  it('emails the first five replies in an hour, then one digest', async () => {
    await withRollback(async (db) => {
      const env = setup(db)
      const a = await person(db, 7)
      for (let i = 0; i < 8; i++) {
        await notify(
          env.ctx({ kind: 'system', reason: 'test' }, new Date(T0.getTime() + i * 60_000)),
          {
            userId: a.userId,
            type: i % 2 ? 'mention' : 'thread.reply',
            title: `Reply ${i}`,
            link: `/learn/x/community/${i}`,
            email: someEmail(`k${i}`),
          },
        )
      }
      expect((await emailsTo(db, a.email)).length).toBe(5)
      const requested = await db
        .select()
        .from(schema.outbox)
        .where(eq(schema.outbox.eventName, 'notification.digest_requested'))
      expect(requested.length).toBeGreaterThan(0)
      const sys = env.ctx({ kind: 'system', reason: 'digest' }, new Date(T0.getTime() + 3_600_000))
      expect(await sendDigest(sys, a.userId)).toBe(3)
      expect(await sendDigest(sys, a.userId)).toBe(0)
      const all = await emailsTo(db, a.email)
      expect(all.map((e) => e.id).filter((id) => id === 'activity-digest')).toHaveLength(1)
      // An hour later the count starts again.
      await notify(
        env.ctx({ kind: 'system', reason: 'test' }, new Date(T0.getTime() + 2 * 3_600_000)),
        {
          userId: a.userId,
          type: 'thread.reply',
          title: 'Later',
          email: someEmail('later'),
        },
      )
      expect((await emailsTo(db, a.email)).length).toBe(7)
    })
  })
})
