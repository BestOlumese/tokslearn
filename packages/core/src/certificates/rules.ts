import { randomInt } from 'node:crypto'

// Pure certificate rules (docs/10 §8): codes, what counts per mode, and the words used on the
// PDF, the verify page, the email and LinkedIn.

export type CertificateMode = 'none' | 'completion' | 'exam' | 'external'
export type CertificateBasis = 'completion' | 'exam' | 'external'

export interface CertificateSettings {
  examQuizId: string | null
  requireCompletion: boolean
  providerName: string | null
  providerUrl: string | null
}

// Crockford base32 without I, L, O, U, as in order references.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_RE = /^TL-C-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/

/** `TL-C-8Q2M-4K7P`: 40 bits of randomness, never sequential. */
export function newCertificateCode(random: (max: number) => number = randomInt): string {
  let body = ''
  for (let i = 0; i < 8; i++) body += ALPHABET[random(ALPHABET.length)]
  return `TL-C-${body.slice(0, 4)}-${body.slice(4)}`
}

/**
 * What someone typed or scanned, as a code, or null. Case, spaces and dashes don't matter, and
 * the letters people confuse with digits (O, I, L) read as 0 and 1, as Crockford intends.
 */
export function normaliseCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (!compact.startsWith('TLC') || compact.length !== 11) return null
  const body = compact.slice(3).replace(/O/g, '0').replace(/[IL]/g, '1')
  const code = `TL-C-${body.slice(0, 4)}-${body.slice(4)}`
  return CODE_RE.test(code) ? code : null
}

/** Stored settings, with anything missing or malformed read as its default. */
export function readCertificateSettings(raw: unknown): CertificateSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' && x.trim() !== '' ? x : null)
  return {
    examQuizId: str(v.examQuizId),
    requireCompletion: v.requireCompletion === true,
    providerName: str(v.providerName),
    providerUrl: str(v.providerUrl),
  }
}

/** Keeps only the settings the mode uses, so switching modes never leaves stale rules behind. */
export function settingsForMode(
  mode: CertificateMode,
  s: CertificateSettings,
): CertificateSettings {
  return {
    examQuizId: mode === 'exam' ? s.examQuizId : null,
    requireCompletion: mode === 'exam' ? s.requireCompletion : false,
    providerName: mode === 'external' ? s.providerName : null,
    providerUrl: mode === 'external' ? s.providerUrl : null,
  }
}

export interface CertificateFacts {
  /** Every lesson completed (which includes passing every graded quiz and assignment). */
  completed: boolean
  /** The learner's passing attempt at the certificate exam, if any. */
  examAttemptId: string | null
  /** The newest external pass recorded for the learner, if any. */
  externalPassId: string | null
}

export type Decision =
  | { basis: 'completion' }
  | { basis: 'exam'; quizAttemptId: string }
  | { basis: 'external'; externalResultId: string }

/** Whether the learner has earned the certificate, and on what basis; null if not (yet). */
export function decide(
  mode: CertificateMode,
  settings: CertificateSettings,
  facts: CertificateFacts,
): Decision | null {
  switch (mode) {
    case 'none':
      return null
    case 'completion':
      return facts.completed ? { basis: 'completion' } : null
    case 'exam':
      if (!settings.examQuizId || !facts.examAttemptId) return null
      if (settings.requireCompletion && !facts.completed) return null
      return { basis: 'exam', quizAttemptId: facts.examAttemptId }
    case 'external':
      return facts.externalPassId
        ? { basis: 'external', externalResultId: facts.externalPassId }
        : null
  }
}

/** The basis line on the verify page (docs/10 §8 wording). */
export function basisText(basis: CertificateBasis, providerName: string | null): string {
  if (basis === 'exam') return 'Passed a timed exam'
  if (basis === 'external')
    return `Externally assessed via ${providerName ?? 'an outside provider'}`
  return 'Completed all lessons'
}

/** The same fact, said to the learner ("You passed the final exam"). */
export function learnerBasisText(basis: CertificateBasis, providerName: string | null): string {
  if (basis === 'exam') return 'You passed the final exam'
  if (basis === 'external') return `You passed the exam run by ${providerName ?? 'the provider'}`
  return 'You completed every lesson'
}

/** LinkedIn's "Add licence or certification" form, prefilled (month is 1–12, Lagos time). */
export function linkedInAddUrl(input: {
  courseTitle: string
  issuedAt: Date
  verifyUrl: string
  code: string
}): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(input.issuedAt)
  const year = parts.find((p) => p.type === 'year')?.value ?? ''
  const month = String(Number(parts.find((p) => p.type === 'month')?.value ?? '1'))
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: input.courseTitle,
    organizationName: 'Tokslearn',
    issueYear: year,
    issueMonth: month,
    certUrl: input.verifyUrl,
    certId: input.code,
  })
  return `https://www.linkedin.com/profile/add?${q.toString().replace(/\+/g, '%20')}`
}

/** A name as printed: printable characters, single spaces, 2–80 characters; null if unusable. */
export function cleanRecipientName(input: string): string | null {
  const printable = [...input]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
  const name = printable.replace(/\s+/g, ' ').trim()
  return name.length >= 2 && name.length <= 80 ? name : null
}
