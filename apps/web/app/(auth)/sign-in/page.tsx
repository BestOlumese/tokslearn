import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Sign in"
      message="Accounts open soon. You'll be able to sign in with email and password, a one-time code, or Google."
    />
  )
}
