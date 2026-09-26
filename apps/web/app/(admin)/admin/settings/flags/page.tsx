import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { FeatureFlagList } from '@/components/admin/feature-flag-list'
import { FeatureFlagListSkeleton } from '@/components/admin/feature-flag-list-skeleton'

export const metadata: Metadata = { title: 'Feature flags', robots: { index: false } }

// docs/20 §6 `/admin/settings/flags` (admin, Phase 0).
export default function FeatureFlagsPage() {
  return (
    <div>
      <AdminPageHeader
        title="Feature flags"
        description="Turn features on or off for everyone. Changes reach every server within a minute and are saved in the audit log."
      />
      <div className="max-w-[760px]">
        <Suspense fallback={<FeatureFlagListSkeleton />}>
          <FeatureFlagList />
        </Suspense>
      </div>
    </div>
  )
}
