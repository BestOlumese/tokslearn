import { isFeatureEnabled } from '@tokslearn/core/admin'
import { ArrowLeft } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ThreadView } from '@/components/community/thread-view'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Discussion', robots: { index: false } }

type Params = Promise<{ courseSlug: string; threadId: string }>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// docs/20 `/learn/[courseSlug]/community`: one discussion. Emails link here.
export default function ThreadPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-page px-4 pt-8" />}>
      <Thread params={params} />
    </Suspense>
  )
}

async function Thread({ params }: { params: Params }) {
  const { courseSlug, threadId } = await params
  const ctx = await requireSignedInCtx(`/learn/${courseSlug}/community/${threadId}`)
  if (!UUID.test(threadId) || !(await isFeatureEnabled(ctx, 'community'))) notFound()
  const back = `/learn/${courseSlug}/community`
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <Link
        href={back as Route}
        className="inline-flex w-fit items-center gap-1.5 text-body-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All discussions
      </Link>
      <ThreadView threadId={threadId} backHref={back} />
    </div>
  )
}
