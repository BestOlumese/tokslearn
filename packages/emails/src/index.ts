// React Email templates from docs/23-email-catalog.md. The first templates (verify-email,
// sign-in-code, reset-password) arrive in Phase 1. Phase 0 sends no email.
export const emailSender = {
  from: 'Tokslearn <hello@mail.tokslearn.com>',
  replyTo: 'support@tokslearn.com',
} as const
