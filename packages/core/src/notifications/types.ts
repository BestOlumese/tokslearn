// Notification types (docs/13 §3, ADR-041). Every in-app notification and every email about
// something that happened on Tokslearn has one. `email: 'locked'` types always email (receipts,
// decisions about your account or course); people choose the rest on
// /account/settings/notifications. Security emails (sign-in codes, new devices, password changes)
// don't go through here: they're sent straight away and can't be turned off.

export type NotificationGroup = 'learning' | 'community' | 'teaching' | 'purchases'

export interface NotificationTypeInfo {
  group: NotificationGroup
  /** Shown on the preferences page. */
  label: string
  description: string
  /** 'locked': always emailed. 'on'/'off': the default when the person hasn't chosen. */
  email: 'locked' | 'on' | 'off'
  /** In-app default (the bell and /account/notifications). */
  inApp: boolean
  /** Busy hours fold these emails into one digest (more than 5 in an hour). */
  digest?: boolean
}

export const notificationTypes = {
  'lesson.unlocked': {
    group: 'learning',
    label: 'Lessons opening',
    description: 'When lessons on a schedule open for you.',
    email: 'on',
    inApp: true,
  },
  'live.reminder': {
    group: 'learning',
    label: 'Live class reminders',
    description: 'The day before and 15 minutes before each live class.',
    email: 'on',
    inApp: true,
  },
  'assignment.graded': {
    group: 'learning',
    label: 'Grades and feedback',
    description: 'When an assignment is graded or sent back to you.',
    email: 'on',
    inApp: true,
  },
  'attempt.voided': {
    group: 'learning',
    label: 'Exam attempts cancelled',
    description: 'If an exam attempt is voided, with the reason.',
    email: 'locked',
    inApp: true,
  },
  'certificate.issued': {
    group: 'learning',
    label: 'Certificates',
    description: 'When you earn a certificate.',
    email: 'locked',
    inApp: true,
  },
  'qa.answered': {
    group: 'community',
    label: 'Answers to your questions',
    description: 'When an instructor or TA answers a question you asked.',
    email: 'on',
    inApp: true,
    digest: true,
  },
  'thread.reply': {
    group: 'community',
    label: 'Replies to your discussions',
    description: 'At most one email per discussion per hour.',
    email: 'on',
    inApp: true,
    digest: true,
  },
  mention: {
    group: 'community',
    label: 'Mentions',
    description: 'When someone writes your @username.',
    email: 'on',
    inApp: true,
    digest: true,
  },
  announcement: {
    group: 'community',
    label: 'Announcements',
    description: 'From the instructors of courses you’re taking.',
    email: 'on',
    inApp: true,
  },
  'review.received': {
    group: 'teaching',
    label: 'New reviews',
    description: 'When a learner reviews one of your courses.',
    email: 'on',
    inApp: true,
  },
  'course.review_decision': {
    group: 'teaching',
    label: 'Course review results',
    description: 'When Tokslearn approves your course or asks for changes.',
    email: 'locked',
    inApp: true,
  },
  'application.decision': {
    group: 'teaching',
    label: 'Instructor application',
    description: 'The decision on your application to teach.',
    email: 'locked',
    inApp: true,
  },
  'order.receipt': {
    group: 'purchases',
    label: 'Receipts',
    description: 'A receipt for every payment, with the refund deadline.',
    email: 'locked',
    inApp: false,
  },
  'enrollment.welcome': {
    group: 'purchases',
    label: 'Free enrolments',
    description: 'When you join a free course.',
    email: 'locked',
    inApp: false,
  },
} as const satisfies Record<string, NotificationTypeInfo>

export type NotificationType = keyof typeof notificationTypes
export const notificationTypeKeys = Object.keys(notificationTypes) as NotificationType[]

export const isNotificationType = (t: string): t is NotificationType => t in notificationTypes

/** More than this many digest-type emails in an hour → the rest wait for the digest. */
export const DIGEST_AFTER = 5
export const DIGEST_WINDOW_MS = 60 * 60 * 1000
