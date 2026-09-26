import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { TwoFactorChallenge } from '@/components/auth/two-factor-challenge'

export const metadata: Metadata = { title: 'Two-factor check', robots: { index: false } }

// docs/20 §2 `/two-factor`: TOTP or backup code after the password step.
export default function TwoFactorPage() {
  return (
    <AuthShell
      title="Confirm it's you"
      intro="Open your authenticator app and enter the code for Tokslearn."
    >
      <TwoFactorChallenge />
    </AuthShell>
  )
}
