import { toMyApplicationDto } from '@tokslearn/api'
import { getMyApplication } from '@tokslearn/core/instructors'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { QueryProvider } from '@/components/query-provider'
import { PageHeader } from '@/components/site/page-header'
import { ApplyWizard } from '@/components/teach/apply-wizard'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = {
  title: 'Apply to teach',
  robots: { index: false },
}

// docs/20 §5 `/teach/apply`: About you → Expertise and sample → Identity → Bank account → Review.
export default function ApplyPage() {
  return (
    <>
      <PageHeader
        title="Apply to teach"
        description="Five short steps. Your answers save as you go, so you can finish later."
      />
      <div className="mx-auto max-w-page px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<ApplySkeleton />}>
          <Apply />
        </Suspense>
      </div>
    </>
  )
}

async function Apply() {
  const ctx = await requireSignedInCtx('/teach/apply')
  const mine = await getMyApplication(ctx)
  if (mine.isInstructor) redirect('/teach/courses')
  return (
    <QueryProvider>
      <ApplyWizard initial={toMyApplicationDto(mine)} />
    </QueryProvider>
  )
}

function ApplySkeleton() {
  return (
    <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
      <Skeleton className="h-96 max-w-[780px]" />
    </div>
  )
}
