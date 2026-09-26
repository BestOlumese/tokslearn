import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Admin', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Admin"
      message="The back office fills in as each area is built. Feature flags are ready now."
      action={{ href: '/admin/settings/flags', label: 'Open feature flags' }}
    />
  )
}
