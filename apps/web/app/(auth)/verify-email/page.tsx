import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { VerifyEmailStatus } from '@/components/auth/verify-email-status'

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false } }

// docs/20 §2 `/verify-email`: "check your inbox", plus the landing state from the link.
export default function VerifyEmailPage() {
  return (
    <AuthShell title="Check your email">
      <Suspense fallback={<div className="h-[184px]" />}>
        <VerifyEmailStatus />
      </Suspense>
    </AuthShell>
  )
}
