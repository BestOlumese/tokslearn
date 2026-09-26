import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { GoogleLink } from '@/components/auth/google-link'
import { OrDivider } from '@/components/auth/or-divider'
import { SignUpForm } from '@/components/auth/sign-up-form'
import { env } from '@/env'

export const metadata: Metadata = {
  title: 'Create an account',
  description:
    'Create a free Tokslearn account to buy courses, track your progress and earn certificates.',
}

// docs/20 §2 `/sign-up`.
export default function SignUpPage() {
  return (
    <AuthShell
      title="Create an account"
      intro="It's free. You pay only for the courses you buy."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href="/sign-in"
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      {env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? (
        <>
          <GoogleLink label="Sign up with Google" />
          <OrDivider />
        </>
      ) : null}
      <SignUpForm />
    </AuthShell>
  )
}
