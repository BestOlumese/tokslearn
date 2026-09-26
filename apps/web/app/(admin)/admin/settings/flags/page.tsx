import type { Metadata } from 'next'
import { Suspense } from 'react'
import { FeatureFlagList } from '@/components/admin/feature-flag-list'
import { FeatureFlagListSkeleton } from '@/components/admin/feature-flag-list-skeleton'

export const metadata: Metadata = { title: 'Feature flags', robots: { index: false } }

// docs/20 §6 `/admin/settings/flags` (admin, Phase 0).
export default function FeatureFlagsPage() {
  return (
    <div>
      <h1 className="text-h1-sm text-ink sm:text-h1">Feature flags</h1>
      <p className="mt-2 max-w-prose text-body text-ink-2">
        Turn features on or off for everyone. Changes reach every server within a minute, and each
        change is saved in the audit log with your name.
      </p>
      <div className="mt-8 max-w-[760px]">
        <Suspense fallback={<FeatureFlagListSkeleton />}>
          <FeatureFlagList />
        </Suspense>
      </div>
    </div>
  )
}
