import type { EmailData, EmailId } from './catalog'

/** Sample data for /styleguide/emails previews and render tests. */
export const emailFixtures: { [Id in EmailId]: EmailData[Id] } = {
  'verify-email': { name: 'Chiamaka', url: 'https://tokslearn.com/verify-email?token=example' },
  'sign-in-code': { code: '482913', expiresInMinutes: 10, device: 'Chrome on Android' },
  'reset-password': { name: 'Chiamaka', url: 'https://tokslearn.com/reset-password?token=example' },
  'password-changed': {
    name: 'Chiamaka',
    when: '2026-09-26T09:15:00.000Z',
    device: 'Safari on iPhone',
    resetUrl: 'https://tokslearn.com/forgot-password',
  },
  'new-sign-in': {
    name: 'Chiamaka',
    when: '2026-09-26T09:15:00.000Z',
    device: 'Chrome on Windows',
    ipHint: '102.89.x.x',
    securityUrl: 'https://tokslearn.com/account/settings/security',
  },
  'two-factor-changed': {
    name: 'Chiamaka',
    change: 'enabled',
    when: '2026-09-26T09:15:00.000Z',
    securityUrl: 'https://tokslearn.com/account/settings/security',
  },
  'email-changed-old': {
    name: 'Chiamaka',
    newEmail: 'c.okafor@example.com',
    cancelUrl: 'https://tokslearn.com/account/settings/security',
  },
  'deletion-requested': {
    name: 'Chiamaka',
    scheduledFor: '2026-10-10T09:15:00.000Z',
    cancelUrl: 'https://tokslearn.com/account/settings/privacy',
  },
  'data-export-ready': {
    name: 'Chiamaka',
    url: 'https://files.tokslearn.com/exports/example.zip',
    expiresAt: '2026-10-03T09:15:00.000Z',
  },
}
