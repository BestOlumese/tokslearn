import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Create an account', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Create an account"
      message="Accounts open soon. Sign-up will ask for your name and email, and you'll confirm the email before buying a course."
    />
  )
}
