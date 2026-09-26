import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BundleForm } from '@/components/studio/bundle-form'
import { NotInstructor } from '@/components/studio/not-instructor'
import { studioCtx } from '@/lib/require-instructor'
import { bundleCourseOptions } from '@/lib/studio-dto'

export const metadata: Metadata = { title: 'New bundle' }

export default function NewBundlePage() {
  return (
    <div>
      <h1 className="text-h1-sm text-ink">New bundle</h1>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-96 w-full max-w-[780px] rounded-card" />}>
          <Form />
        </Suspense>
      </div>
    </div>
  )
}

async function Form() {
  const { ctx, isInstructor } = await studioCtx('/teach/bundles/new')
  if (!isInstructor) return <NotInstructor />
  return <BundleForm bundle={null} courses={await bundleCourseOptions(ctx)} />
}
