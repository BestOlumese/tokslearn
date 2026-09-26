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
