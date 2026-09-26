import { describe, expect, it } from 'vitest'
import { createMemoryRateLimiter } from './rate-limiter'

describe('memory rate limiter', () => {
  it('allows up to the limit, then reports seconds until the window resets', async () => {
    let t = 0
    const limiter = createMemoryRateLimiter(() => t)
    const policy = { limit: 2, windowSec: 60 }
    expect((await limiter.check('auth', 'ip1', policy)).allowed).toBe(true)
    expect((await limiter.check('auth', 'ip1', policy)).allowed).toBe(true)
    t = 15_000
    expect(await limiter.check('auth', 'ip1', policy)).toEqual({
      allowed: false,
      retryAfterSec: 45,
    })
    expect((await limiter.check('auth', 'ip2', policy)).allowed).toBe(true)
    t = 60_000
    expect((await limiter.check('auth', 'ip1', policy)).allowed).toBe(true)
  })
})
