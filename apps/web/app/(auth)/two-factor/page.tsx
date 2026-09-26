import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { TwoFactorChallenge } from '@/components/auth/two-factor-challenge'

export const metadata: Metadata = { title: 'Two-factor check', robots: { index: false } }

// docs/20 §2 `/two-factor`: TOTP or backup code after the password step.
export default function TwoFactorPage() {
  return (
    <AuthShell
      title="Enter your security code"
      intro="Open your authenticator app and type the 6-digit code for Tokslearn."
    >
      <TwoFactorChallenge />
    </AuthShell>
  )
}
