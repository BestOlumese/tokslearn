import { isFeatureEnabled } from '@tokslearn/core/admin'
import { isDomainError } from '@tokslearn/core/kernel'
import * as learning from '@tokslearn/core/learning'
import { ArrowLeft } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { ThreadList } from '@/components/community/thread-list'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Discussions', robots: { index: false } }

type Params = Promise<{ courseSlug: string }>

// docs/20 `/learn/[courseSlug]/community`: the course's discussions, questions and announcements
// (and the learner's cohort's). Behind the `community` flag.
export default function CommunityPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-page px-4 pt-8" />}>
      <Community params={params} />
    </Suspense>
  )
}

async function Community({ params }: { params: Params }) {
  const { courseSlug } = await params
  const ctx = await requireSignedInCtx(`/learn/${courseSlug}/community`)
  if (!(await isFeatureEnabled(ctx, 'community'))) notFound()
  let outline: learning.LearnOutline
  try {
    outline = await learning.getCourseOutline(ctx, courseSlug)
  } catch (e) {
    if (isDomainError(e) && e.code === 'NOT_ENROLLED') redirect(`/courses/${courseSlug}` as Route)
    if (isDomainError(e)) notFound()
    throw e
  }
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <Link
        href={`/learn/${courseSlug}` as Route}
        className="inline-flex w-fit items-center gap-1.5 text-body-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {outline.course.title}
      </Link>
      <div>
        <h1 className="text-h2 text-ink">Discussions</h1>
        <p className="mt-1 text-body text-ink-2">
          Ask about a lesson, share what worked, and read your instructor’s announcements.
          {outline.cohort ? ` Your ${outline.cohort.name} cohort’s threads are here too.` : ''}
        </p>
      </div>
      <ThreadList
        courseId={outline.course.id}
        courseSlug={courseSlug}
        showFilters
        kinds={['question', 'discussion']}
        newLabel="Start a discussion"
        empty="Nothing here yet. Ask the first question or say hello to your classmates."
      />
    </div>
  )
}
