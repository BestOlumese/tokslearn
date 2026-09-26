import { describe, expect, it } from 'vitest'
import { anonymousActor, hasRole, isStaff, systemActor } from './actor'

const user = (...roles: Array<'learner' | 'admin' | 'finance'>) => ({
  kind: 'user' as const,
  userId: 'u1',
  sessionId: 's1',
  roles,
})

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
