// Better Auth error code → our user-facing copy (docs/21). Loaded only when an error happens,
// so the sign-in pages don't pay for it up front (docs/12 §1).

import { authMessages, fillMessage } from '@tokslearn/contract/auth-messages'

export const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: authMessages.INVALID_CREDENTIALS.message,
  USER_ALREADY_EXISTS: 'An account with this email already exists. Sign in instead.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    'An account with this email already exists. Sign in instead.',
  INVALID_OTP: authMessages.OTP_INVALID.message,
  OTP_EXPIRED: authMessages.OTP_INVALID.message,
  TOO_MANY_ATTEMPTS: 'Too many wrong codes. Ask for a new code.',
  INVALID_CODE: authMessages.OTP_INVALID.message,
  INVALID_TWO_FACTOR_COOKIE: 'Your sign-in took too long. Start again.',
  INVALID_TOKEN: 'This link has expired or was already used. Ask for a new one.',
  BANNED_USER: authMessages.ACCOUNT_BANNED.message,
  PASSWORD_TOO_SHORT: 'Use at least 10 characters.',
  PASSWORD_TOO_LONG: 'Use 128 characters or fewer.',
  INVALID_PASSWORD: 'Your current password is wrong.',
  CREDENTIAL_ACCOUNT_NOT_FOUND:
    'This account signs in with Google or an email code, so it has no password yet.',
  USER_NOT_FOUND: 'We couldn’t find an account with that email.',
}

export function describeAuthError(
  code: string,
  status: number,
  serverMessage: string,
  retryAfter: number,
): string {
  if (code === 'ACCOUNT_LOCKED' || code === 'PASSWORD_COMPROMISED') return serverMessage
  if (status === 429)
    return fillMessage(authMessages.RATE_LIMITED.message, { retryAfterSec: retryAfter || 60 })
  return (
    messages[code] ?? (serverMessage || 'Something went wrong on our side. Try again in a moment.')
  )
}
