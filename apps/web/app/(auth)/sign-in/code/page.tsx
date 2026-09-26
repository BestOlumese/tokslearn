import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { CodeSignIn } from '@/components/auth/code-sign-in'

export const metadata: Metadata = { title: 'Sign in with a code', robots: { index: false } }

// docs/20 §2 `/sign-in/code`.
export default function CodeSignInPage() {
  return (
    <AuthShell
      title="Sign in with a code"
      intro="No password needed. We email you a code for accounts that already exist."
      footer={
        <Link href="/sign-in" className="font-medium text-brand underline-offset-4 hover:underline">
          Sign in with a password instead
        </Link>
      }
    >
      <CodeSignIn />
    </AuthShell>
  )
}
