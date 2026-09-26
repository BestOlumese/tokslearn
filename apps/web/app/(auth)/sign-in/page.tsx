import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { GoogleLink } from '@/components/auth/google-link'
import { OrDivider } from '@/components/auth/or-divider'
import { SignInForm } from '@/components/auth/sign-in-form'
import { env } from '@/env'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Tokslearn with your email and password, a one-time code or Google.',
}

// docs/20 §2 `/sign-in`. `?next=` is read on submit and kept through 2FA.
export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      footer={
        <>
          New to Tokslearn?{' '}
          <a href="/sign-up" className="font-medium text-brand underline-offset-4 hover:underline">
            Create an account
          </a>
        </>
      }
    >
      {env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? (
        <>
          <GoogleLink label="Sign in with Google" />
          <OrDivider />
        </>
      ) : null}
      <SignInForm />
    </AuthShell>
  )
}
