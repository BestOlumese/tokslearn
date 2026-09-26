import { listCategoryTree } from '@tokslearn/core/catalog'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DetailsForm } from '@/components/studio/details-form'
import { getServerCtx } from '@/lib/server-ctx'

export const metadata: Metadata = { title: 'Course details' }

// docs/20 §5 `/teach/courses/[id]/details`. Promo video arrives with the course page (Phase 3).
export default function DetailsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-[860px] rounded-card" />}>
      <Details />
    </Suspense>
  )
}

async function Details() {
  const categories = await listCategoryTree(await getServerCtx())
  return <DetailsForm categories={categories} />
}
