import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { LiveClasses } from '@/components/studio/live/live-classes'
import { liveOn } from '@/lib/catalog-data'

export const metadata: Metadata = { title: 'Live classes' }

// docs/20 `/teach/live`: upcoming and past live classes, schedule, start, attendance.
export default function TeachLivePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 text-ink">Live classes</h1>
        <p className="mt-1 text-body text-ink-2">
          Teach on video with your learners. Classes run in the browser, on a laptop or a phone, and
          can be recorded for those who miss them.
        </p>
      </div>
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </div>
  )
}

async function Gate() {
  if (!(await liveOn())) notFound()
  return <LiveClasses />
}
