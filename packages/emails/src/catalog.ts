// Email catalog (docs/23-email-catalog.md is the source of truth; add emails there first).
// Pure types and metadata: safe to import from core and jobs without pulling in React.

export type EmailCategory = 'security' | 'transactional' | 'activity' | 'marketing'

export interface EmailData {
  'verify-email': { name: string; url: string }
  'sign-in-code': { code: string; expiresInMinutes: number; device: string | null }
  'reset-password': { name: string; url: string }
  'password-changed': { name: string; when: string; device: string | null; resetUrl: string }
  'new-sign-in': {
    name: string
    when: string
    device: string | null
    ipHint: string | null
    securityUrl: string
  }
  'two-factor-changed': {
    name: string
    change: 'enabled' | 'disabled' | 'backup_codes'
    when: string
    securityUrl: string
  }
  'email-changed-old': { name: string; newEmail: string; cancelUrl: string }
  'deletion-requested': { name: string; scheduledFor: string; cancelUrl: string }
  'data-export-ready': { name: string; url: string; expiresAt: string }
  'application-received': { name: string; statusUrl: string }
  'application-decision': {
    name: string
    approved: boolean
    reason: string | null
    reapplyOn: string | null
    /** Approved: the studio. Not approved: the teach page. */
    url: string
  }
  'kyc-result': { name: string; outcome: 'verified' | 'manual_review' | 'failed'; applyUrl: string }
  'payout-account-changed': {
    name: string
    bankName: string
    last4: string
    payoutsFrom: string
    securityUrl: string
  }
  'course-review-decision': {
    name: string
    courseTitle: string
    approved: boolean
    notes: string | null
    /** Approved: the public course page. Changes: the course's publish page in the studio. */
    url: string
  }
  'order-receipt': {
    name: string
    publicId: string
    /** ISO time the payment was confirmed. */
    paidAt: string
    items: Array<{
      title: string
      netKobo: string
      /** e.g. "Refunds until 8 October 2026" or "No refunds for this course". */
      refundLine: string
    }>
    subtotalKobo: string
    discountKobo: string
    totalKobo: string
    /** card, bank transfer, USSD… or null for free orders. */
    paymentMethod: string | null
    learnUrl: string
    receiptUrl: string
  }
  'enrollment-free': {
    name: string
    courseTitle: string
    lessonCount: number
    /** Pre-formatted, e.g. "3 h 20 min". */
    duration: string | null
    /** Plain words about the certificate, or null when there is none. */
    certificate: string | null
    url: string
  }
  'assignment-graded': {
    name: string
    courseTitle: string
    assignmentTitle: string
    /** "graded", or "returned" for resubmission. */
    decision: 'graded' | 'returned'
    /** e.g. "18 / 20", or null when returned without a score. */
    score: string | null
    passed: boolean | null
    /** First words of the feedback, plain text. */
    feedbackExcerpt: string | null
    url: string
  }
  'attempt-voided': {
    name: string
    courseTitle: string
    examTitle: string
    reason: string
    url: string
  }
  'certificate-issued': {
    name: string
    courseTitle: string
    /** e.g. "You passed the final exam" or "You completed every lesson". */
    basisText: string
    code: string
    /** My certificates, where the PDF downloads. */
    url: string
    verifyUrl: string
    linkedInUrl: string
  }
  'thread-reply': {
    name: string
    courseTitle: string
    threadTitle: string
    replierName: string
    /** First words of the reply, plain text. */
    excerpt: string
    /** An instructor's or TA's answer to the reader's question. */
    isAnswer: boolean
    url: string
  }
  mention: {
    name: string
    courseTitle: string
    threadTitle: string
    authorName: string
    excerpt: string
    url: string
  }
  announcement: {
    courseTitle: string
    instructorName: string
    /** Set when it went to one cohort. */
    cohortName: string | null
    title: string
    /** Plain text, paragraphs separated by a blank line, at most 2,000 characters. */
    body: string
    url: string
  }
  'activity-digest': {
    name: string
    /** How many updates waited (the list shows at most 20). */
    count: number
    items: Array<{ title: string; url: string | null }>
    /** /account/notifications */
    url: string
  }
  'new-review': {
    /** The instructor's first name. */
    name: string
    courseTitle: string
    rating: number
    /** Up to 280 characters, or null for a rating without words. */
    excerpt: string | null
    /** The studio's Reviews page, where they reply. */
    url: string
  }
  'live-reminder-24h': {
    name: string
    courseTitle: string
    cohortName: string | null
    sessionTitle: string
    hostName: string
    /** "Friday 2 October at 7:00 pm" (Lagos). */
    when: string
    /** "7:00 pm" (Lagos), for the subject. */
    time: string
    /** The session page: join button and, afterwards, the recording. */
    url: string
    calendarUrl: string
  }
  'live-reminder-15m': Omit<EmailData['live-reminder-24h'], 'calendarUrl'>
  'lesson-unlocked': {
    name: string
    courseTitle: string
    /** Titles of the lessons that opened, in course order (at least one). */
    lessons: string[]
    /** The first of them in the player. */
    url: string
  }
}

export type EmailId = keyof EmailData

export const emailCategory: Readonly<Record<EmailId, EmailCategory>> = {
  'verify-email': 'security',
  'sign-in-code': 'security',
  'reset-password': 'security',
  'password-changed': 'security',
  'new-sign-in': 'security',
  'two-factor-changed': 'security',
  'email-changed-old': 'security',
  'deletion-requested': 'security',
  'data-export-ready': 'transactional',
  'application-received': 'transactional',
  'application-decision': 'transactional',
  'kyc-result': 'transactional',
  'payout-account-changed': 'security',
  'course-review-decision': 'transactional',
  'order-receipt': 'transactional',
  'enrollment-free': 'transactional',
  'lesson-unlocked': 'activity',
  'assignment-graded': 'activity',
  'attempt-voided': 'transactional',
  'certificate-issued': 'transactional',
  'thread-reply': 'activity',
  mention: 'activity',
  announcement: 'activity',
  'new-review': 'activity',
  'activity-digest': 'activity',
  'live-reminder-24h': 'activity',
  'live-reminder-15m': 'activity',
}

export const emailIds = Object.keys(emailCategory) as EmailId[]

/** A queued email. `idempotencyKey` = `{id}:{businessKey}` so retries never double-send (docs/23). */
export interface EmailRequest<Id extends EmailId = EmailId> {
  id: Id
  to: string
  data: EmailData[Id]
  idempotencyKey: string
}

/** Dates in emails are shown in Lagos time (CLAUDE.md §5). */
export function formatLagos(iso: string, withTime = true): string {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(iso))
}

/** Naira from kobo, as on receipts: ₦15,000 or ₦1,250.50. */
export function formatNairaKobo(kobo: string): string {
  const value = BigInt(kobo)
  const naira = value / 100n
  const k = value % 100n
  const whole = naira.toLocaleString('en-NG')
  return k === 0n ? `₦${whole}` : `₦${whole}.${k.toString().padStart(2, '0')}`
}
