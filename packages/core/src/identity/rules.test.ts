import { describe, expect, it } from 'vitest'
import type { Role, UserActor } from '../kernel/actor'
import { describeDevice, ipHint } from './device'
import { canActOnUser, canBanUsers, canManageRole, canViewUsers, mirroredRole } from './rules'

const user = (...roles: Role[]): UserActor => ({
  kind: 'user',
  userId: 'me',
  sessionId: 's',
  roles,
  emailVerified: true,
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date(),
})

describe('identity rules', () => {
  it('lets support view users but not ban them', () => {
    expect(canViewUsers(user('support'))).toBe(true)
    expect(canBanUsers(user('support'))).toBe(false)
    expect(canBanUsers(user('admin'))).toBe(true)
    expect(canViewUsers(user('instructor'))).toBe(false)
  })

  it('keeps admin and super admin grants for super admins', () => {
    expect(canManageRole(user('admin'), 'finance')).toBe(true)
    expect(canManageRole(user('admin'), 'admin')).toBe(false)
    expect(canManageRole(user('super_admin'), 'admin')).toBe(true)
    expect(canManageRole(user('super_admin'), 'learner')).toBe(false)
  })

  it('blocks acting on yourself and admins acting on super admins', () => {
    expect(canActOnUser(user('super_admin'), 'me', ['learner'])).toBe(false)
    expect(canActOnUser(user('admin'), 'other', ['learner', 'super_admin'])).toBe(false)
    expect(canActOnUser(user('super_admin'), 'other', ['super_admin'])).toBe(true)
  })

  it('mirrors the highest role for Better Auth', () => {
    expect(mirroredRole(['learner'])).toBe('learner')
    expect(mirroredRole(['learner', 'instructor'])).toBe('instructor')
    expect(mirroredRole(['learner', 'support', 'admin'])).toBe('admin')
  })
})

describe('device hints', () => {
  it('describes common browsers', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome on Android')
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iPhone')
    expect(describeDevice(null)).toBe('Unknown device')
  })

  it('hides the end of IP addresses', () => {
    expect(ipHint('102.89.34.7')).toBe('102.89.x.x')
    expect(ipHint('2c0f:f5c0:440:1::1')).toBe('2c0f:f5c0:…')
    expect(ipHint(null)).toBeNull()
  })
})
