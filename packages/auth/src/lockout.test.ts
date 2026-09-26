import { describe, expect, it } from 'vitest'
import { createLockout } from './lockout'

describe('account lockout', () => {
  it('locks after 10 failures and doubles the wait on the next lock', async () => {
    const lockout = createLockout()
    for (let i = 0; i < 9; i++) await lockout.recordFailure('Ada@Example.com')
    expect(await lockout.retryAfter('ada@example.com')).toBe(0)

    await lockout.recordFailure('ada@example.com')
    const first = await lockout.retryAfter('ada@example.com')
    expect(first).toBeGreaterThan(14 * 60)
    expect(first).toBeLessThanOrEqual(15 * 60)

    for (let i = 0; i < 10; i++) await lockout.recordFailure('ada@example.com')
    expect(await lockout.retryAfter('ada@example.com')).toBeGreaterThan(29 * 60)
  })

  it('clears the failure count after a successful sign-in', async () => {
    const lockout = createLockout()
    for (let i = 0; i < 9; i++) await lockout.recordFailure('bola@example.com')
    await lockout.reset('bola@example.com')
    await lockout.recordFailure('bola@example.com')
    expect(await lockout.retryAfter('bola@example.com')).toBe(0)
  })
})
