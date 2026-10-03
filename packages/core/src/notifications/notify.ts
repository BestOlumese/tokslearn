import { schema } from '@tokslearn/db'
import type { EmailData, EmailId } from '@tokslearn/emails/catalog'
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { type Ctx, provider } from '../kernel/ctx'
import { ForbiddenError, NotFoundError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { sendEmail } from './service'
import {
  DIGEST_AFTER,
  DIGEST_WINDOW_MS,
  type NotificationGroup,
  type NotificationType,
  notificationTypeKeys,
  notificationTypes,
} from './types'

// The notification centre (docs/13 §3, docs/20 Phase 9 rows, ADR-041): `notify` writes the
// in-app row and emails according to the person's choices; busy hours of replies and mentions
// fold into one digest. Foreign reads (docs/03 §3): user.

const { notifications, notificationPreferences, user } = schema

type EmailRequest = {
  [Id in EmailId]: { id: Id; data: EmailData[Id]; businessKey: string }
}[EmailId]

export interface NotifyInput {
  userId: string
  type: NotificationType
  /** One line for the bell and the list. */
  title: string
  body?: string | null
  /** A path inside the app, e.g. `/learn/excel/community/…`. */
  link?: string | null
  data?: Record<string, unknown>
  /** For senders that may run twice (jobs): the same key for the same person is written once. */
  dedupeKey?: string
  /** The email for this notification, if the type has one. */
  email?: EmailRequest
}

const digestTypes = notificationTypeKeys.filter(
  (t) => (notificationTypes[t] as { digest?: boolean }).digest,
)

async function preferenceMap(ctx: Ctx, userIds: string[], types: string[]) {
  const rows = await ctx.db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        inArray(notificationPreferences.userId, userIds),
        inArray(notificationPreferences.type, types),
      ),
    )
  return new Map(rows.map((r) => [`${r.userId}|${r.type}|${r.channel}`, r.enabled]))
}

/** Several notifications at once (announcements, reminders): two lookups for the whole batch. */
export async function notifyMany(ctx: Ctx, inputs: ReadonlyArray<NotifyInput>): Promise<void> {
  if (inputs.length === 0) return
  const userIds = [...new Set(inputs.map((i) => i.userId))]
  const types = [...new Set(inputs.map((i) => i.type))]
  const needsDigestCount = inputs.some((i) => i.email && digestTypes.includes(i.type))
  const [prefs, people, recent] = await Promise.all([
    preferenceMap(ctx, userIds, types),
    ctx.db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(and(inArray(user.id, userIds), isNull(user.deletedAt))),
    needsDigestCount
      ? ctx.db
          .select({ userId: notifications.userId, n: sql<number>`count(*)::int` })
          .from(notifications)
          .where(
            and(
              inArray(notifications.userId, userIds),
              inArray(notifications.type, digestTypes),
              inArray(notifications.email, ['sent', 'digest_pending']),
              gt(notifications.createdAt, new Date(ctx.now.getTime() - DIGEST_WINDOW_MS)),
            ),
          )
          .groupBy(notifications.userId)
      : Promise.resolve([]),
  ])
  const emails = new Map(people.map((p) => [p.id, p.email]))
  const busy = new Map(recent.map((r) => [r.userId, r.n]))
  const digestFor = new Set<string>()
  const rows: Array<typeof notifications.$inferInsert> = []

  for (const i of inputs) {
    const address = emails.get(i.userId)
    if (!address) continue
    const info = notificationTypes[i.type]
    const inApp = prefs.get(`${i.userId}|${i.type}|in_app`) ?? info.inApp
    const emailOn =
      info.email === 'locked' || (prefs.get(`${i.userId}|${i.type}|email`) ?? info.email === 'on')
    let email: 'none' | 'sent' | 'digest_pending' = 'none'
    if (i.email && emailOn) {
      const digestable = digestTypes.includes(i.type)
      const count = busy.get(i.userId) ?? 0
      if (digestable && count >= DIGEST_AFTER) {
        email = 'digest_pending'
        digestFor.add(i.userId)
      } else {
        await sendEmail(ctx, { ...i.email, to: address } as Parameters<typeof sendEmail>[1])
        email = 'sent'
      }
      if (digestable) busy.set(i.userId, count + 1)
    }
    if (!inApp && email === 'none') continue
    rows.push({
      userId: i.userId,
      type: i.type,
      title: i.title.slice(0, 200),
      body: i.body ? i.body.slice(0, 300) : null,
      link: i.link ?? null,
      data: i.data ?? {},
      inApp,
      email,
      dedupeKey: i.dedupeKey ?? null,
      // The request's clock, not the database's: millisecond precision keeps the list's cursor
      // exact, and the digest's hour is measured on the same clock.
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
  }
  if (rows.length > 0) await ctx.db.insert(notifications).values(rows).onConflictDoNothing()
  for (const userId of digestFor) {
    await ctx.events.emit('notification.digest_requested', { userId })
  }
}

export const notify = (ctx: Ctx, input: NotifyInput) => notifyMany(ctx, [input])

// ─── The digest job ──────────────────────────────────────────────────────────────────────────

const appUrl = (ctx: Ctx, path: string | null) =>
  path ? `${provider(ctx, 'urls').app.replace(/\/$/, '')}${path}` : null

/**
 * `notification-digest`: one email with everything that waited during a busy hour. Safe to run
 * twice: rows move to `digested` before the email is queued, in the same transaction.
 */
export async function sendDigest(ctx: Ctx, userId: string): Promise<number> {
  const rows = await ctx.db
    .update(notifications)
    .set({ email: 'digested' })
    .where(and(eq(notifications.userId, userId), eq(notifications.email, 'digest_pending')))
    .returning({
      id: notifications.id,
      title: notifications.title,
      link: notifications.link,
      createdAt: notifications.createdAt,
    })
  if (rows.length === 0) return 0
  const [person] = await ctx.db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(and(eq(user.id, userId), isNull(user.deletedAt)))
  if (!person) return 0
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const last = sorted[sorted.length - 1]
  await sendEmail(ctx, {
    id: 'activity-digest',
    to: person.email,
    businessKey: `${userId}:${last?.id ?? ''}`,
    data: {
      name: person.name.split(/\s+/)[0] ?? person.name,
      count: rows.length,
      items: sorted.slice(0, 20).map((r) => ({ title: r.title, url: appUrl(ctx, r.link) })),
      url: appUrl(ctx, '/account/notifications') ?? '',
    },
  })
  return rows.length
}

// ─── The bell and the list ───────────────────────────────────────────────────────────────────

export interface NotificationView {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: Date
}

const PAGE = 20

/** The signed-in person's notifications, newest first; `before` is the last item's id. */
export async function listNotifications(
  ctx: Ctx,
  input: { before?: string | undefined },
): Promise<{ items: NotificationView[]; hasMore: boolean }> {
  const me = requireUser(ctx.actor)
  let cursor: { createdAt: Date; id: string } | null = null
  if (input.before) {
    const [c] = await ctx.db
      .select({ createdAt: notifications.createdAt, id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, input.before), eq(notifications.userId, me.userId)))
    if (!c) throw new NotFoundError('NOTIFICATION_NOT_FOUND')
    cursor = c
  }
  const rows = await ctx.db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, me.userId),
        eq(notifications.inApp, true),
        cursor
          ? or(
              lt(notifications.createdAt, cursor.createdAt),
              and(eq(notifications.createdAt, cursor.createdAt), lt(notifications.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(PAGE + 1)
  return {
    hasMore: rows.length > PAGE,
    items: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      read: r.readAt !== null,
      createdAt: r.createdAt,
    })),
  }
}

/** The bell's number: counts at most 100 unread (shown as "99+"), from the partial index. */
export async function unreadCount(ctx: Ctx): Promise<number> {
  const me = requireUser(ctx.actor)
  const res = await ctx.db.execute(sql`
    select count(*)::int as n from (
      select 1 from notifications
      where user_id = ${me.userId} and in_app and read_at is null
      limit 100
    ) unread`)
  return Number((res as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0)
}

/** Marks some (or all) of the person's notifications read. */
export async function markRead(
  ctx: Ctx,
  input: { ids?: string[] | undefined; all?: boolean | undefined },
): Promise<number> {
  const me = requireUser(ctx.actor)
  if (!input.all && (!input.ids || input.ids.length === 0)) return 0
  const done = await ctx.db
    .update(notifications)
    .set({ readAt: ctx.now })
    .where(
      and(
        eq(notifications.userId, me.userId),
        isNull(notifications.readAt),
        input.all ? undefined : inArray(notifications.id, input.ids ?? []),
      ),
    )
    .returning({ id: notifications.id })
  return done.length
}

// ─── Preferences ─────────────────────────────────────────────────────────────────────────────

export interface PreferenceRow {
  type: NotificationType
  group: NotificationGroup
  label: string
  description: string
  email: boolean
  emailLocked: boolean
  inApp: boolean
}

export async function getPreferences(ctx: Ctx): Promise<PreferenceRow[]> {
  const me = requireUser(ctx.actor)
  const prefs = await preferenceMap(ctx, [me.userId], notificationTypeKeys)
  return notificationTypeKeys.map((type) => {
    const info: (typeof notificationTypes)[NotificationType] = notificationTypes[type]
    const locked = info.email === 'locked'
    return {
      type,
      group: info.group,
      label: info.label,
      description: info.description,
      email: locked || (prefs.get(`${me.userId}|${type}|email`) ?? info.email === 'on'),
      emailLocked: locked,
      inApp: prefs.get(`${me.userId}|${type}|in_app`) ?? info.inApp,
    }
  })
}

/** Turns one channel of one type on or off. Locked emails can't be turned off. */
export async function setPreference(
  ctx: Ctx,
  input: { type: NotificationType; channel: 'email' | 'in_app'; enabled: boolean },
): Promise<PreferenceRow[]> {
  const me = requireUser(ctx.actor)
  const info: (typeof notificationTypes)[NotificationType] = notificationTypes[input.type]
  if (input.channel === 'email' && info.email === 'locked') {
    throw new ForbiddenError('NOTIFICATION_LOCKED')
  }
  const fallback = input.channel === 'email' ? info.email === 'on' : info.inApp
  if (input.enabled === fallback) {
    await ctx.db
      .delete(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, me.userId),
          eq(notificationPreferences.type, input.type),
          eq(notificationPreferences.channel, input.channel),
        ),
      )
  } else {
    await ctx.db
      .insert(notificationPreferences)
      .values({
        userId: me.userId,
        type: input.type,
        channel: input.channel,
        enabled: input.enabled,
      })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.userId,
          notificationPreferences.type,
          notificationPreferences.channel,
        ],
        set: { enabled: input.enabled, updatedAt: ctx.now },
      })
  }
  return getPreferences(ctx)
}

/** Read rows older than 90 days go (the list is a feed, not an archive). */
export async function pruneNotifications(ctx: Ctx): Promise<number> {
  const cutoff = new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000)
  const gone = await ctx.db
    .delete(notifications)
    .where(
      and(
        lt(notifications.createdAt, cutoff),
        or(sql`${notifications.readAt} is not null`, eq(notifications.inApp, false)),
      ),
    )
    .returning({ id: notifications.id })
  return gone.length
}
