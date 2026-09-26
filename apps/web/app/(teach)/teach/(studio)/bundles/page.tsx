import { listMyBundles } from '@tokslearn/core/courses'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tokslearn/ui/table'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { NotInstructor } from '@/components/studio/not-instructor'
import { studioCtx } from '@/lib/require-instructor'

export const metadata: Metadata = { title: 'Bundles' }

const fmt = (kobo: bigint) => `₦${(kobo / 100n).toLocaleString('en-NG')}`

// docs/20 §5 `/teach/bundles`. Bundles go on sale with checkout (Phase 4).
export default function BundlesPage() {
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-h1-sm text-ink">Bundles</h1>
          <p className="mt-1 text-body text-ink-2">Sell related courses together for one price.</p>
        </div>
        <Link href="/teach/bundles/new" className={buttonClasses({ variant: 'secondary' })}>
          New bundle
        </Link>
      </div>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-60 w-full rounded-card" />}>
          <Bundles />
        </Suspense>
      </div>
    </div>
  )
}

async function Bundles() {
  const { ctx, isInstructor } = await studioCtx('/teach/bundles')
  if (!isInstructor) return <NotInstructor />
  const bundles = await listMyBundles(ctx)
  if (bundles.length === 0) {
    return (
      <EmptyState
        title="No bundles yet"
        description="Once you have two published courses, bundle them at a lower combined price."
        action={
          <Link href="/teach/bundles/new" className={buttonClasses({ variant: 'secondary' })}>
            Create a bundle
          </Link>
        }
      />
    )
  }
  return (
    <Table>
      <TableCaption>Your bundles</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Bundle</TableHead>
          <TableHead>Courses</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bundles.map((b) => (
          <TableRow key={b.id}>
            <TableCell>
              <Link
                href={`/teach/bundles/${b.id}` as Route}
                className="font-medium text-brand underline-offset-4 hover:underline"
              >
                {b.title}
              </Link>
            </TableCell>
            <TableCell className="tabular-nums">{b.courseIds.length}</TableCell>
            <TableCell className="tabular-nums">{fmt(b.priceKobo)}</TableCell>
            <TableCell>
              <Badge tone={b.status === 'active' ? 'brand' : 'neutral'}>
                {b.status === 'active' ? 'Active' : 'Draft'}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
