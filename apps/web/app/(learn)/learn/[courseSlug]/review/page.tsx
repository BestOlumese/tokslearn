import { isDomainError } from '@tokslearn/core/kernel'
import * as reviews from '@tokslearn/core/reviews'
import { Progress } from '@tokslearn/ui/progress'
import { ArrowLeft } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { ReviewForm } from '@/components/reviews/review-form'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Review this course', robots: { index: false } }

type Params = Promise<{ courseSlug: string }>

// docs/20 `/learn/[courseSlug]/review`: rating and review form, edited if one exists; before the
// learner is eligible, how far they still have to go.
export default function ReviewPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-[720px] px-4 pt-8" />}>
      <Review params={params} />
    </Suspense>
  )
}

async function Review({ params }: { params: Params }) {
  const { courseSlug } = await params
  const ctx = await requireSignedInCtx(`/learn/${courseSlug}/review`)
  let page: reviews.MyReviewPage
  try {
    page = await reviews.getMyReview(ctx, courseSlug)
  } catch (e) {
    if (isDomainError(e) && e.code === 'NOT_ENROLLED') redirect(`/courses/${courseSlug}` as Route)
    if (isDomainError(e)) notFound()
    throw e
  }
  const { course, eligibility: el, review } = page
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <Link
        href={`/learn/${courseSlug}` as Route}
        className="inline-flex w-fit items-center gap-1.5 text-body-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {course.title}
      </Link>
      <div>
        <h1 className="text-h2 text-ink">{review ? 'Your review' : 'Review this course'}</h1>
        <p className="mt-1 text-body text-ink-2">
          Reviews help other learners choose, and tell your instructor what to improve.
        </p>
      </div>
      {review?.hidden ? (
        <p className="rounded-card border border-border bg-canvas p-4 text-body-sm text-ink-2">
          Tokslearn staff hid this review after a report, so it isn’t on the course page. Edit it if
          something in it broke the{' '}
          <Link href="/content-policy" className="text-brand-ink hover:underline">
            content rules
          </Link>
          , or write to support@tokslearn.com.
        </p>
      ) : null}
      {el.eligible ? (
        <ReviewForm
          courseId={course.id}
          initial={
            review
              ? {
                  ...review,
                  createdAt: review.createdAt.toISOString(),
                  editedAt: review.editedAt?.toISOString() ?? null,
                }
              : null
          }
        />
      ) : (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 sm:p-6">
          <p className="text-body text-ink">
            You can review this course after finishing {el.needPct}% of it or {el.needMinutes}{' '}
            minutes of learning, so your review is based on the course itself.
          </p>
          <Progress
            value={Math.min(100, (el.progressPct / Math.max(1, el.needPct)) * 100)}
            label="Progress towards reviewing"
            showValue={false}
          />
          <p className="text-body-sm text-ink-2">
            You’ve finished {el.progressPct}% and watched {el.minutesLearned}{' '}
            {el.minutesLearned === 1 ? 'minute' : 'minutes'}.
          </p>
          <Link
            href={`/learn/${courseSlug}` as Route}
            className="w-fit text-body-sm font-medium text-brand-ink hover:underline"
          >
            Carry on learning
          </Link>
        </div>
      )}
      {review?.instructorReply ? (
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-body-sm font-medium text-ink">Your instructor replied</p>
          <p className="mt-1 whitespace-pre-line text-body text-ink-2">{review.instructorReply}</p>
        </div>
      ) : null}
    </div>
  )
}
