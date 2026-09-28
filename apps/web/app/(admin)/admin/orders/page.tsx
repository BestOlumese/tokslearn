import * as commerce from '@tokslearn/core/commerce'
import { Badge } from '@tokslearn/ui/badge'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Input } from '@tokslearn/ui/input'
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
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime, formatNaira } from '@/lib/format'
import { orderStatusBadge } from '@/lib/order-status'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Orders' }

type Search = Promise<{ q?: string; cursor?: string }>

// docs/20 §6 `/admin/orders` (finance, support, admins): search by order id, Paystack reference
// or buyer email.
export default function AdminOrdersPage({ searchParams }: { searchParams: Search }) {
  return (
    <div>
      <AdminPageHeader
        title="Orders"
        description="Find an order by its number, the Paystack reference or the buyer's email."
      />
      <Suspense fallback={<Skeleton className="mt-6 h-72 w-full rounded-card" />}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function Orders({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const path = '/admin/orders'
  const ctx = await requireSignedInCtx(path)
  let page: Awaited<ReturnType<typeof commerce.searchOrders>>
  try {
    page = await commerce.searchOrders(ctx, { q: params.q?.slice(0, 200), cursor: params.cursor })
  } catch (error) {
    return <div className="mt-6">{staffErrorState(error, path)}</div>
  }
  return (
    <>
      <form action={path} aria-label="Search orders" className="flex gap-3">
        <label htmlFor="q" className="sr-only">
          Order number, Paystack reference or email
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={params.q ?? ''}
          placeholder="TL-7K3M9Q2A or amaka@example.com"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
          Search
        </button>
      </form>
      <div className="mt-5">
        {page.items.length === 0 ? (
          <EmptyState
            title="No orders match"
            description="Check the order number, or search by the buyer's full email address."
          />
        ) : (
          <Table>
            <TableCaption>Orders, newest first</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((o) => {
                const [label, tone] = orderStatusBadge[o.status]
                return (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link
                        href={`/admin/orders/${o.id}` as Route}
                        className="font-medium text-brand underline-offset-4 hover:underline"
                      >
                        {o.publicId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {o.buyerName}
                      <div className="text-ink-3">{o.buyerEmail}</div>
                    </TableCell>
                    <TableCell>
                      {o.firstTitle}
                      {o.itemsCount > 1 ? ` +${o.itemsCount - 1}` : ''}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatNaira(o.totalKobo)}
                    </TableCell>
                    <TableCell>
                      <Badge tone={tone}>{label}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(o.createdAt)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
      {page.nextCursor ? (
        <Link
          href={
            `${path}?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), cursor: page.nextCursor })}` as Route
          }
          className={buttonClasses({ variant: 'secondary', className: 'mt-4' })}
        >
          Older orders
        </Link>
      ) : null}
    </>
  )
}
