import type { ErrorEntry } from './message-types'

/**
 * Auth and account messages, split out so the sign-in pages import only these few strings
 * instead of the whole catalog (docs/12 §1 JS budget). Part of `errorCatalog`.
 */
export const authMessages = {
  SESSION_EXPIRED: { status: 'UNAUTHORIZED', message: 'Your session ended. Sign in again.' },
  EMAIL_NOT_VERIFIED: {
    status: 'FORBIDDEN',
    message: 'Verify your email to continue. We sent a link to {email}.',
  },
  INVALID_CREDENTIALS: { status: 'UNAUTHORIZED', message: 'Email or password is incorrect.' },
  ACCOUNT_LOCKED: {
    status: 'FORBIDDEN',
    message: 'Too many attempts. Try again in {minutes} minutes.',
  },
  ACCOUNT_BANNED: {
    status: 'FORBIDDEN',
    message: 'This account has been suspended. Contact support.',
  },
  OTP_INVALID: { status: 'BAD_REQUEST', message: 'That code is wrong or has expired.' },
  TWO_FACTOR_REQUIRED: {
    status: 'FORBIDDEN',
    message: 'Turn on two-factor authentication to continue.',
  },
  STEP_UP_REQUIRED: {
    status: 'FORBIDDEN',
    message: "Confirm it's you with your authenticator code.",
  },
  USERNAME_TAKEN: { status: 'CONFLICT', message: 'That username is taken.' },
  EMAIL_TAKEN: { status: 'CONFLICT', message: 'An account with this email already exists.' },
  DELETION_PENDING: {
    status: 'CONFLICT',
    message: 'Your account is scheduled for deletion. Cancel the request to continue.',
  },

  RATE_LIMITED: {
    status: 'TOO_MANY_REQUESTS',
    message: "You're doing that too often. Try again in {retryAfterSec} seconds.",
  },
} as const satisfies Record<string, ErrorEntry>

/** Fills `{placeholders}`; unknown keys stay visible rather than printing "undefined". */
export function fillMessage(
  template: string,
  params: Readonly<Record<string, unknown>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : match
  })
}
