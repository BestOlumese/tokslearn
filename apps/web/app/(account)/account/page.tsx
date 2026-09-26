import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Your account', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Your account"
      message="Your courses, orders and certificates will show here once accounts open."
    />
  )
}
