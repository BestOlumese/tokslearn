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
  'application-received': {
    name: 'Tobi',
    statusUrl: 'https://tokslearn.com/teach/apply',
  },
  'application-decision': {
    name: 'Tobi',
    approved: true,
    reason: null,
    reapplyOn: null,
    url: 'https://tokslearn.com/teach/courses',
  },
  'kyc-result': {
    name: 'Tobi',
    outcome: 'manual_review',
    applyUrl: 'https://tokslearn.com/teach/apply',
  },
  'payout-account-changed': {
    name: 'Tobi',
    bankName: 'Guaranty Trust Bank',
    last4: '4821',
    payoutsFrom: '2026-09-29T09:15:00.000Z',
    securityUrl: 'https://tokslearn.com/account/settings/security',
  },
  'course-review-decision': {
    name: 'Tobi',
    courseTitle: 'Excel for Accountants',
    approved: false,
    notes: 'Lesson 3 audio is very quiet. Please re-record it.\nAdd one preview lesson.',
    url: 'https://tokslearn.com/teach/courses/example/publish',
  },
  'order-receipt': {
    name: 'Amaka',
    publicId: 'TL-7K3M9Q2A',
    paidAt: '2026-10-01T09:30:00.000Z',
    items: [
      {
        title: 'Excel for Accountants',
        netKobo: '1350000',
        refundLine: 'Refunds until 8 October 2026, if you have watched less than 30%',
      },
      {
        title: 'Power BI Dashboards',
        netKobo: '2500000',
        refundLine: 'No refunds for this course',
      },
    ],
    subtotalKobo: '4000000',
    discountKobo: '150000',
    totalKobo: '3850000',
    paymentMethod: 'card',
    learnUrl: 'https://tokslearn.com/account',
    receiptUrl: 'https://tokslearn.com/account/orders/TL-7K3M9Q2A',
  },
  'enrollment-free': {
    name: 'Amaka',
    courseTitle: 'Bookkeeping for Small Businesses',
    lessonCount: 12,
    duration: '2 h 40 min',
    certificate: 'Finish every lesson to get a certificate employers can check.',
    url: 'https://tokslearn.com/account',
  },
}
