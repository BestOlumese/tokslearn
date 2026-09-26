import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Help', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Help"
      message="Help articles are being written. Until then, email support@tokslearn.com and a person will reply."
    />
  )
}
