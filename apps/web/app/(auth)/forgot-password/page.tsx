import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata: Metadata = { title: 'Reset your password', robots: { index: false } }

// docs/20 §2 `/forgot-password`.
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Forgot your password?"
      intro="Enter the email you signed up with and we’ll send you a link to reset it."
      footer={
        <a href="/sign-in" className="font-medium text-brand underline-offset-4 hover:underline">
          Back to sign in
        </a>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  )
}
