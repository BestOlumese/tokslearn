import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AttemptReview } from '@/components/grading/attempt-review'

export const metadata: Metadata = { title: 'Review an exam attempt' }

type Params = Promise<{ attemptId: string }>

// docs/20 §5 `/teach/grading`, flagged exam attempts tab.
export default function AttemptReviewPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
      <Page params={params} />
    </Suspense>
  )
}

async function Page({ params }: { params: Params }) {
  const { attemptId } = await params
  return <AttemptReview attemptId={attemptId} />
}
