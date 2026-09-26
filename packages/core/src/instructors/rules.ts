import { hasRole, type UserActor } from '../kernel/actor'

// Pure rules for instructor onboarding (docs/07 §3, §5). Services call these; UI checks are
// cosmetic.

/** Reviewers and admins decide applications (permission matrix, docs/07 §3). */
export const canReviewApplications = (actor: UserActor): boolean =>
  hasRole(actor, 'reviewer', 'admin', 'super_admin')

export const REAPPLY_AFTER_DAYS = 30
/** Selfie confidence below this goes to manual review (Dojah returns 0–100). */
export const FACE_MATCH_THRESHOLD = 80
/** Bank account name vs verified name, and account name vs verified name (docs/07 §5). */
export const NAME_MATCH_THRESHOLD = 0.85
/** Payouts to a newly added or changed account start after this hold. */
export const PAYOUT_HOLD_HOURS = 72

export const reapplyDate = (decidedAt: Date): Date =>
  new Date(decidedAt.getTime() + REAPPLY_AFTER_DAYS * 24 * 60 * 60 * 1000)

const TITLES = new Set([
  'MR',
  'MRS',
  'MS',
  'MISS',
  'DR',
  'PROF',
  'CHIEF',
  'ALHAJI',
  'ALHAJA',
  'ALH',
  'HAJIA',
  'ENGR',
  'BARR',
  'PASTOR',
  'REV',
])

/** Uppercase letter tokens without titles; "Adeleke, Tobi-Oluwa" → ADELEKE, TOBI, OLUWA. */
export function nameTokens(name: string): string[] {
  const tokens = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !TITLES.has(t))
  return [...new Set(tokens)]
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return prev[b.length] ?? 0
}

const tokenSimilar = (a: string, b: string) =>
  a === b || 1 - levenshtein(a, b) / Math.max(a.length, b.length) >= 0.85

/**
 * Token-set similarity, 0–1: the share of the shorter name's tokens found (exactly or with a
 * small typo) in the longer one. Word order and extra middle names don't count against a match;
 * a single-token name is capped at 0.5 because one shared name proves little.
 */
export function nameMatchScore(a: string, b: string): number {
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (short.length === 0) return 0
  const matched = short.filter((t) => long.some((u) => tokenSimilar(t, u))).length
  const score = matched / short.length
  return short.length < 2 ? Math.min(score, 0.5) : score
}

export const namesMatch = (a: string, b: string): boolean =>
  nameMatchScore(a, b) >= NAME_MATCH_THRESHOLD

export type KycStatus = 'verified' | 'failed' | 'manual_review'

/**
 * Decision for one KYC attempt (docs/07 §5 step 3): not found → failed; a found record with a weak
 * selfie match or a name that doesn't match the account → manual review; otherwise verified.
 */
export function kycOutcome(input: {
  found: boolean
  faceMatchScore: number | null
  registeredName: string | null
  accountName: string
}): KycStatus {
  if (!input.found) return 'failed'
  if (input.faceMatchScore === null || input.faceMatchScore < FACE_MATCH_THRESHOLD) {
    return 'manual_review'
  }
  if (!input.registeredName || !namesMatch(input.registeredName, input.accountName)) {
    return 'manual_review'
  }
  return 'verified'
}

/** What the applicant still has to do before submitting (drives /teach/apply). */
export function applicationGaps(input: {
  hasAbout: boolean
  hasExpertise: boolean
  kycStatus: KycStatus | 'pending' | null
  hasPayoutAccount: boolean
}): Array<'about' | 'expertise' | 'kyc' | 'bank'> {
  const gaps: Array<'about' | 'expertise' | 'kyc' | 'bank'> = []
  if (!input.hasAbout) gaps.push('about')
  if (!input.hasExpertise) gaps.push('expertise')
  if (input.kycStatus !== 'verified' && input.kycStatus !== 'manual_review') gaps.push('kyc')
  if (!input.hasPayoutAccount) gaps.push('bank')
  return gaps
}

/** Instructor URL slug from a display name: "Tobi Adeleke" → "tobi-adeleke". */
export function slugify(input: string, maxLength = 60): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
  return slug || 'instructor'
}
