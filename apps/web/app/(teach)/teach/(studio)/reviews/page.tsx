import type { Metadata } from 'next'
import { Suspense } from 'react'
import { StudioReviews } from '@/components/studio/reviews/studio-reviews'

export const metadata: Metadata = { title: 'Reviews' }

type Search = Promise<{ course?: string }>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// docs/20 `/teach/reviews`: reviews of the courses you teach and your replies.
export default function TeachReviewsPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 text-ink">Reviews</h1>
        <p className="mt-1 text-body text-ink-2">
          What learners say about your courses. You can reply once to each review and edit it later;
          the reply shows under the review on the course page.
        </p>
      </div>
      <Suspense fallback={null}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function List({ searchParams }: { searchParams: Search }) {
  const { course } = await searchParams
  return <StudioReviews courseId={course && UUID.test(course) ? course : null} />
}
