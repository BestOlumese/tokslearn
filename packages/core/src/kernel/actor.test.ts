import { describe, expect, it } from 'vitest'
import {
  anonymousActor,
  hasRecentStepUp,
  hasRole,
  isStaff,
  staffSecurityProblem,
  systemActor,
} from './actor'
import { testUser } from './testing'

const user = (...roles: Array<'learner' | 'admin' | 'finance'>) => testUser(roles)

describe('actor helpers', () => {
  it('treats only staff roles as staff', () => {
    expect(isStaff(user('learner'))).toBe(false)
    expect(isStaff(user('finance'))).toBe(true)
    expect(isStaff(anonymousActor)).toBe(false)
    expect(isStaff(systemActor('cron'))).toBe(false)
  })

  it('checks any of the wanted roles', () => {
    expect(hasRole(user('learner', 'admin'), 'admin', 'super_admin')).toBe(true)
    expect(hasRole(user('learner'), 'admin')).toBe(false)
  })
})

describe('staff security', () => {
  it('needs 2FA enabled, then verified in this session', () => {
    expect(staffSecurityProblem(testUser(['admin'], { twoFactorEnabled: false }))).toBe(
      'TWO_FACTOR_REQUIRED',
    )
    expect(staffSecurityProblem(testUser(['admin'], { twoFactorVerifiedAt: null }))).toBe(
      'STEP_UP_REQUIRED',
    )
    expect(staffSecurityProblem(testUser(['admin']))).toBeNull()
  })

  it('treats a 2FA check older than 12 hours as stale for step-up', () => {
    const now = new Date('2026-09-26T12:00:00Z')
    const fresh = testUser(['instructor'], {
      twoFactorVerifiedAt: new Date('2026-09-26T01:00:00Z'),
    })
    const stale = testUser(['instructor'], {
      twoFactorVerifiedAt: new Date('2026-09-25T23:00:00Z'),
    })
    expect(hasRecentStepUp(fresh, now)).toBe(true)
    expect(hasRecentStepUp(stale, now)).toBe(false)
  })
})
