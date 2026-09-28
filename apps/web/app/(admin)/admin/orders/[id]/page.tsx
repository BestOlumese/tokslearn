import * as commerce from '@tokslearn/core/commerce'
import { Badge } from '@tokslearn/ui/badge'
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
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { JournalEntryList } from '@/components/admin/journal-entry-list'
import { OrderReverify } from '@/components/admin/order-reverify'
import { staffErrorState } from '@/components/admin/staff-error'
import { formatDateTime, formatNaira } from '@/lib/format'
import { orderStatusBadge } from '@/lib/order-status'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Order' }

type Params = Promise<{ id: string }>

const sourceLabel: Record<string, string> = {
  instructor_referral: 'Instructor link',
  instructor_coupon: 'Instructor coupon',
  platform_organic: 'Tokslearn',
  platform_paid: 'Tokslearn ads',
}

// docs/20 §6 `/admin/orders/[id]`: items with commission snapshots, ledger entries, Paystack
// webhooks, and a re-check with Paystack.
export default function AdminOrderPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
      <Order params={params} />
    </Suspense>
  )
}

const k = (v: bigint | null) => (v === null ? '—' : formatNaira(v))

async function Order({ params }: { params: Params }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const path = `/admin/orders/${id}`
  const ctx = await requireSignedInCtx(path)
  let o: commerce.AdminOrderDetail
  try {
    o = await commerce.getOrderForStaff(ctx, id)
  } catch (error) {
    return staffErrorState(error, path)
  }
  const [label, tone] = orderStatusBadge[o.status]
  return (
    <div className="flex flex-col gap-8">
      <AdminPageHeader
        title={`Order ${o.publicId}`}
        description={`${o.buyer.name} · ${o.buyer.email}`}
      />
      <div className="-mt-4 flex flex-wrap items-center gap-3 text-body-sm text-ink-2">
        <Badge tone={tone}>{label}</Badge>
        <span>Created {formatDateTime(o.createdAt)}</span>
        {o.paidAt ? <span>· Paid {formatDateTime(o.paidAt)}</span> : null}
        {o.paymentChannel ? <span>· {o.paymentChannel}</span> : null}
        <span>
          · {o.provider === 'none' ? 'No payment (free)' : `Paystack ref ${o.providerReference}`}
        </span>
        {o.failureReason ? <span>· {o.failureReason}</span> : null}
      </div>
      {o.provider === 'paystack' && o.status !== 'paid' ? <OrderReverify orderId={o.id} /> : null}

      <section aria-labelledby="items-title">
        <h2 id="items-title" className="text-h3 text-ink">
          Items
        </h2>
        <div className="mt-3">
          <Table>
            <TableCaption>
              Totals: {formatNaira(o.subtotalKobo)} list, −{formatNaira(o.discountKobo)} discount,{' '}
              {formatNaira(o.totalKobo)} paid, Paystack fee {k(o.gatewayFeeKobo)}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead className="text-right">Instructor</TableHead>
                <TableHead className="text-right">Platform</TableHead>
                <TableHead>Earning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link
                      href={`/courses/${i.courseSlug}` as Route}
                      className="text-brand underline-offset-4 hover:underline"
                    >
                      {i.title}
                    </Link>
                    {i.bundleId ? <div className="text-ink-3">In a bundle</div> : null}
                  </TableCell>
                  <TableCell>{sourceLabel[i.attributionSource] ?? i.attributionSource}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNaira(i.netPriceKobo)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {i.platformRateBps / 100}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {k(i.gatewayFeeShareKobo)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {k(i.instructorShareKobo)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {k(i.platformShareKobo)}
                  </TableCell>
                  <TableCell>
                    {i.earningStatus}
                    {i.refundableUntil ? (
                      <div className="text-ink-3">
                        refundable to {formatDateTime(i.refundableUntil)}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="ledger-title">
        <h2 id="ledger-title" className="text-h3 text-ink">
          Ledger entries
        </h2>
        <div className="mt-3">
          <JournalEntryList entries={o.ledger} />
        </div>
      </section>

      <section aria-labelledby="webhooks-title">
        <h2 id="webhooks-title" className="text-h3 text-ink">
          Paystack webhooks
        </h2>
        {o.webhooks.length === 0 ? (
          <p className="mt-2 text-body-sm text-ink-2">None received for this order.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1 text-body-sm text-ink-2">
            {o.webhooks.map((w) => (
              <li key={`${w.type}-${w.receivedAt.toISOString()}`}>
                <span className="font-mono text-ink">{w.type}</span> received{' '}
                {formatDateTime(w.receivedAt)}
                {w.processedAt
                  ? `, processed ${formatDateTime(w.processedAt)}`
                  : ', not processed yet'}
                {w.error ? ` (${w.error})` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
