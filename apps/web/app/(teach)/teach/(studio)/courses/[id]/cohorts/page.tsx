import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CohortsTab } from '@/components/studio/cohorts/cohorts-tab'

export const metadata: Metadata = { title: 'Cohorts' }

// docs/20 §5 `/teach/courses/[id]/cohorts`: sell by start date; runs with dates and seats.
export default function CohortsPage() {
  return (
    <Suspense fallback={null}>
      <CohortsTab />
    </Suspense>
  )
}
