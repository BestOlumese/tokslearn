import { describe, expect, it } from 'vitest'
import { anonymousActor, type Role, systemActor } from '../kernel/actor'
import { canDispatchOutbox, canManageFeatureFlags, canViewStyleguide } from './rules'

const user = (...roles: Role[]) => ({ kind: 'user' as const, userId: 'u', sessionId: 's', roles })

describe('admin rules', () => {
  it('only admins and super admins manage feature flags', () => {
    expect(canManageFeatureFlags(user('admin'))).toBe(true)
    expect(canManageFeatureFlags(user('super_admin'))).toBe(true)
    expect(canManageFeatureFlags(user('finance'))).toBe(false)
    expect(canManageFeatureFlags(user('learner', 'instructor'))).toBe(false)
    expect(canManageFeatureFlags(anonymousActor)).toBe(false)
    expect(canManageFeatureFlags(systemActor('job'))).toBe(false)
  })

  it('any staff role can open the styleguide', () => {
    expect(canViewStyleguide(user('support'))).toBe(true)
    expect(canViewStyleguide(user('instructor'))).toBe(false)
  })

  it('only system actors dispatch the outbox', () => {
    expect(canDispatchOutbox(systemActor('outbox-dispatch'))).toBe(true)
    expect(canDispatchOutbox(user('super_admin'))).toBe(false)
  })
})
