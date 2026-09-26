import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Verify a certificate', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Verify a certificate"
      message="We can't check this code yet. Certificate checks open with the first issued certificates."
      action={{ href: '/verify', label: 'Enter a different code' }}
    />
  )
}
