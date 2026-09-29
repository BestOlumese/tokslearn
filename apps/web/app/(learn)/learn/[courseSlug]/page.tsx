import { isDomainError } from '@tokslearn/core/kernel'
import * as learning from '@tokslearn/core/learning'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { PlayerSkeleton } from '@/components/learn/player-skeleton'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Continue learning', robots: { index: false } }

type Params = Promise<{ courseSlug: string }>

// docs/20 `/learn/[courseSlug]`: straight to the first lesson not yet finished that can be opened.
export default function ContinuePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <Continue params={params} />
    </Suspense>
  )
}

async function Continue({ params }: { params: Params }) {
  const { courseSlug } = await params
  const ctx = await requireSignedInCtx(`/learn/${courseSlug}`)
  let outline: learning.LearnOutline
  try {
    outline = await learning.getCourseOutline(ctx, courseSlug)
  } catch (e) {
    if (isDomainError(e) && e.code === 'COURSE_NOT_FOUND') notFound()
    if (isDomainError(e) && (e.code === 'NOT_ENROLLED' || e.code === 'ENROLLMENT_REVOKED')) {
      redirect(`/courses/${courseSlug}` as Route)
    }
    throw e
  }
  if (outline.nextLessonId) redirect(`/learn/${courseSlug}/${outline.nextLessonId}` as Route)
  return (
    <div className="mx-auto w-full max-w-page px-4 py-16 sm:px-6">
      <EmptyState
        title="This course has no lessons open yet"
        description="Your instructor releases lessons on a schedule. We'll email you when the first one opens."
        action={
          <Link href="/account" className={buttonClasses({ variant: 'secondary' })}>
            Back to My learning
          </Link>
        }
      />
    </div>
  )
}
