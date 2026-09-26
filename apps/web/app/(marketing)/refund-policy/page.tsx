import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Refund policy', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Refund policy"
      message="Each course sets a refund window of none, 3, 7 or 14 days. The full rules, including when watching a course ends the window, will be published here."
    />
  )
}
