import { getBundle } from '@tokslearn/core/courses'
import { isDomainError } from '@tokslearn/core/kernel'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { BundleForm } from '@/components/studio/bundle-form'
import { NotInstructor } from '@/components/studio/not-instructor'
import { studioCtx } from '@/lib/require-instructor'
import { bundleCourseOptions } from '@/lib/studio-dto'

export const metadata: Metadata = { title: 'Bundle' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function BundlePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <Link
        href="/teach/bundles"
        className="inline-flex min-h-11 items-center text-body-sm text-brand underline-offset-4 hover:underline"
      >
        All bundles
      </Link>
      <div className="mt-2">
        <Suspense fallback={<Skeleton className="h-96 w-full max-w-[780px] rounded-card" />}>
          <Editor params={params} />
        </Suspense>
      </div>
    </div>
  )
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, isInstructor } = await studioCtx(`/teach/bundles/${id}`)
  if (!isInstructor) return <NotInstructor />
  let bundle: Awaited<ReturnType<typeof getBundle>>
  try {
    if (!UUID.test(id)) throw new Error('bad id')
    bundle = await getBundle(ctx, id)
  } catch (error) {
    if (isDomainError(error) && error.code !== 'BUNDLE_NOT_FOUND') throw error
    return (
      <EmptyState
        title="We couldn't find that bundle."
        description="It may have been archived, or the link is wrong."
        action={
          <Link href="/teach/bundles" className={buttonClasses({ variant: 'secondary' })}>
            Your bundles
          </Link>
        }
      />
    )
  }
  return (
    <>
      <h1 className="mb-6 text-h1-sm text-ink">{bundle.title}</h1>
      <BundleForm
        bundle={{
          id: bundle.id,
          slug: bundle.slug,
          title: bundle.title,
          description: bundle.description,
          priceKobo: bundle.priceKobo.toString(),
          status: bundle.status,
          courseIds: bundle.courseIds,
          updatedAt: bundle.updatedAt.toISOString(),
        }}
        courses={await bundleCourseOptions(ctx)}
      />
    </>
  )
}
