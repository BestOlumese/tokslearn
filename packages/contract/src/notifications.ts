import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'

// Phase 9 notification centre (docs/06 §5, docs/13 §3, docs/20 Phase 9 rows, ADR-041).

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: ['Notifications'], summary, description })
const post = (path: `/${string}`, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: ['Notifications'], summary, description })

/** Mirrors core's registry (packages/core/src/notifications/types.ts). */
export const NotificationType = z.enum([
  'lesson.unlocked',
  'live.reminder',
  'assignment.graded',
  'attempt.voided',
  'certificate.issued',
  'qa.answered',
  'thread.reply',
  'mention',
  'announcement',
  'review.received',
  'course.review_decision',
  'application.decision',
  'wishlist.price_drop',
  'refund.updated',
  'sale.refunded',
  'earnings.statement',
  'instructor.strike',
  'payout.sent',
  'payout.failed',
  'order.receipt',
  'enrollment.welcome',
])
export type NotificationType = z.infer<typeof NotificationType>

const NotificationShape = z.object({
  id: z.uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  /** A path inside the app. */
  link: z.string().nullable(),
  read: z.boolean(),
  createdAt: IsoDateTime,
})
export type NotificationDto = z.infer<typeof NotificationShape>
export const NotificationDto = named(NotificationShape)

const PreferenceShape = z.object({
  type: NotificationType,
  group: z.enum(['learning', 'community', 'teaching', 'purchases']),
  label: z.string(),
  description: z.string(),
  email: z.boolean(),
  /** Always emailed; can't be turned off. */
  emailLocked: z.boolean(),
  /** False for in-app-only kinds. */
  emailAvailable: z.boolean(),
  inApp: z.boolean(),
})
export type NotificationPreferenceDto = z.infer<typeof PreferenceShape>
export const NotificationPreferenceDto = named(PreferenceShape)

const Preferences = z.object({ items: z.array(NotificationPreferenceDto) })

export const notificationsContract = {
  list: get(
    '/notifications',
    'My notifications',
    'Newest first, 20 at a time; pass the last id as `before` for the next page.',
  )
    .input(z.object({ before: z.uuid().optional() }))
    .output(z.object({ items: z.array(NotificationDto), hasMore: z.boolean() })),
  unreadCount: get(
    '/notifications/unread-count',
    'Unread count',
    'For the bell: counts up to 100 (show "99+"). Cheap; poll every 60 s while visible.',
  ).output(z.object({ count: z.number().int() })),
  markRead: post(
    '/notifications/read',
    'Mark read',
    'Some (`ids`) or all (`all: true`) of your notifications.',
  )
    .input(
      z.strictObject({
        ids: z.array(z.uuid()).max(100).optional(),
        all: z.boolean().optional(),
      }),
    )
    .output(z.object({ updated: z.number().int() })),
  unsubscribe: post(
    '/notifications/unsubscribe',
    'Stop an opt-in email',
    "From the signed link in the email; no sign-in needed. Always-on emails can't be stopped this way.",
  )
    .input(
      z.strictObject({
        userId: z.uuid(),
        type: z.string().min(1).max(60),
        signature: z.string().min(10).max(200),
      }),
    )
    .output(z.object({ label: z.string() })),
  preferences: {
    get: get(
      '/notifications/preferences',
      'Notification settings',
      'Every type with its email and in-app choice; receipts and decisions are always emailed.',
    ).output(Preferences),
    set: post(
      '/notifications/preferences',
      'Change a notification setting',
      'One type, one channel. Turning off an always-on email is NOTIFICATION_LOCKED.',
    )
      .input(
        z.strictObject({
          type: NotificationType,
          channel: z.enum(['email', 'in_app']),
          enabled: z.boolean(),
        }),
      )
      .output(Preferences),
  },
}
