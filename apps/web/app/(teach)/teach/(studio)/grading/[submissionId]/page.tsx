import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { GradingView } from '@/components/grading/grading-view'

export const metadata: Metadata = { title: 'Grade a submission' }

type Params = Promise<{ submissionId: string }>

// docs/20 §5 `/teach/grading`, grading view.
export default function GradeSubmissionPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
      <Page params={params} />
    </Suspense>
  )
}

async function Page({ params }: { params: Params }) {
  const { submissionId } = await params
  return <GradingView submissionId={submissionId} />
}
