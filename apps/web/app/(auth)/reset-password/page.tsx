import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } }

// docs/20 §2 `/reset-password` (reached from the emailed link).
export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <Suspense fallback={<div className="h-[248px]" />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  )
}
