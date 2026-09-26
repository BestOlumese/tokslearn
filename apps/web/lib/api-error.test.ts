import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from './api-error'

describe('apiErrorMessage', () => {
  it('uses the catalog message for a defined error code', () => {
    const error = new ORPCError('TOO_MANY_REQUESTS', {
      defined: true,
      data: { code: 'RATE_LIMITED', retryAfterSec: 30 },
    })
    expect(apiErrorMessage(error)).toBe("You're doing that too often. Try again in 30 seconds.")
  })

  it('treats anything else as a connection problem', () => {
    expect(apiErrorMessage(new TypeError('Failed to fetch'))).toBe(
      "We couldn't reach Tokslearn. Check your connection and try again.",
    )
  })
})
