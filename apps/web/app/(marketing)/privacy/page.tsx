import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Privacy', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Privacy"
      message="Our privacy policy will be published here before sign-up opens. It will list every service that handles your data and where."
    />
  )
}
