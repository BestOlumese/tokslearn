import * as commerce from '@tokslearn/core/commerce'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
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
import { PageHeader } from '@/components/site/page-header'
import { formatDate, formatNaira } from '@/lib/format'
import { orderStatusBadge } from '@/lib/order-status'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Orders', robots: { index: false } }

// docs/20 §3 `/account/orders`: date, order id, items, total, status.
export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  return (
    <>
      <PageHeader
        title="Orders"
        width="catalog"
        eyebrow={
          <Link href="/account" className="hover:underline">
            My learning
          </Link>
        }
        actions={
          <Link href="/account/refunds" className="text-body-sm text-brand-ink hover:underline">
            Refund requests
          </Link>
        }
      />
      <div className="mx-auto max-w-catalog px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="h-48 animate-pulse rounded-card bg-surface-sunken" />}>
          <Orders searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  )
}

async function Orders({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { cursor } = await searchParams
  const ctx = await requireSignedInCtx('/account/orders')
  const page = await commerce.listMyOrders(ctx, { cursor })
  if (page.items.length === 0 && !cursor) {
    return (
      <EmptyState
        title="No orders yet"
        description="When you buy a course, the receipt is kept here."
        action={
          <Link href="/courses" className={buttonClasses({ variant: 'secondary' })}>
            Browse courses
          </Link>
        }
      />
    )
  }
  return (
    <>
      <Table>
        <TableCaption>Your orders, newest first</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Items</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((o) => {
            const [label, tone] = orderStatusBadge[o.status]
            return (
              <TableRow key={o.id}>
                <TableCell className="whitespace-nowrap">{formatDate(o.createdAt)}</TableCell>
                <TableCell>
                  <Link
                    href={`/account/orders/${o.publicId}` as Route}
                    className="font-medium text-brand underline-offset-4 hover:underline"
                  >
                    {o.publicId}
                  </Link>
                </TableCell>
                <TableCell>
                  {o.firstTitle}
                  {o.itemsCount > 1 ? ` and ${o.itemsCount - 1} more` : ''}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {o.totalKobo === 0n ? 'Free' : formatNaira(o.totalKobo)}
                </TableCell>
                <TableCell>
                  <Badge tone={tone}>{label}</Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {page.nextCursor ? (
        <Link
          href={`/account/orders?cursor=${page.nextCursor}` as Route}
          className={buttonClasses({ variant: 'secondary', className: 'mt-4' })}
        >
          Older orders
        </Link>
      ) : null}
    </>
  )
}
