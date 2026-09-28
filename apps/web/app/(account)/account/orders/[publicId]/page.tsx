import * as commerce from '@tokslearn/core/commerce'
import { DomainError } from '@tokslearn/core/kernel'
import { Badge } from '@tokslearn/ui/badge'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AutoRefresh } from '@/components/shop/auto-refresh'
import { PageHeader } from '@/components/site/page-header'
import { formatDate, formatDateTime, formatNaira } from '@/lib/format'
import { orderStatusBadge } from '@/lib/order-status'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Receipt', robots: { index: false } }

type Params = Promise<{ publicId: string }>

// docs/20 §3 `/account/orders/[publicId]`: items, prices, discount, payment method, refund rule
// per course with its last date. Refund requests arrive with Phase 10.
export default function ReceiptPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto mt-12 h-72 max-w-3xl animate-pulse rounded-card bg-surface-sunken" />
      }
    >
      <Receipt params={params} />
    </Suspense>
  )
}

const channelLabel: Record<string, string> = {
  card: 'Card',
  bank: 'Bank',
  bank_transfer: 'Bank transfer',
  ussd: 'USSD',
  qr: 'QR code',
  mobile_money: 'Mobile money',
}

async function Receipt({ params }: { params: Params }) {
  const { publicId } = await params
  const ctx = await requireSignedInCtx(`/account/orders/${publicId}`)
  let order: commerce.OrderDetail
  try {
    order = await commerce.getMyOrder(ctx, publicId)
  } catch (e) {
    if (e instanceof DomainError && e.code === 'ORDER_NOT_FOUND') notFound()
    throw e
  }
  const [label, tone] = orderStatusBadge[order.status]

  return (
    <>
      <PageHeader
        title={`Order ${order.publicId}`}
        width="page"
        eyebrow={
          <Link href="/account/orders" className="hover:underline">
            Orders
          </Link>
        }
      />
      <div className="mx-auto max-w-page px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          {order.status === 'pending' ? <AutoRefresh everyMs={5000} /> : null}
          <div className="flex flex-wrap items-center gap-3 text-body-sm text-ink-2">
            <Badge tone={tone}>{label}</Badge>
            <span>
              {order.paidAt
                ? `Paid ${formatDateTime(order.paidAt)}`
                : `Started ${formatDateTime(order.createdAt)}`}
            </span>
            {order.paymentChannel ? (
              <span>· {channelLabel[order.paymentChannel] ?? order.paymentChannel}</span>
            ) : null}
          </div>
          {order.status === 'pending' ? (
            <p className="mt-4 rounded-card border border-border bg-surface px-4 py-3 text-body-sm text-ink-2">
              Confirming payment… This page updates by itself. Bank transfers can take a few
              minutes.
            </p>
          ) : null}

          <ul className="mt-6 divide-y divide-border rounded-card border border-border bg-surface">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <Link
                    href={`/courses/${item.courseSlug}` as Route}
                    className="text-body font-medium text-ink hover:text-brand-ink hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-0.5 text-body-sm text-ink-2">
                    {item.status === 'refunded'
                      ? 'Refunded'
                      : item.refundPolicyDays === 0 || item.status === 'non_refundable'
                        ? 'No refunds for this course'
                        : item.refundableUntil
                          ? `Refunds until ${formatDate(item.refundableUntil)}, if you've watched less than 30%`
                          : `Refunds within ${item.refundPolicyDays} days of payment`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-body text-ink">{formatNaira(item.netPriceKobo)}</p>
                  {item.discountKobo > 0n ? (
                    <p className="text-body-sm text-ink-3 line-through">
                      <span className="sr-only">Was </span>
                      {formatNaira(item.listPriceKobo)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-6 ml-auto flex max-w-xs flex-col gap-2 text-body-sm">
            {order.discountKobo > 0n ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-ink-2">Subtotal</dt>
                  <dd className="text-ink">{formatNaira(order.subtotalKobo)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-2">Discount</dt>
                  <dd className="text-ink">−{formatNaira(order.discountKobo)}</dd>
                </div>
              </>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="text-body font-semibold text-ink">Total</dt>
              <dd className="text-body font-semibold text-ink">
                {order.totalKobo === 0n ? 'Free' : formatNaira(order.totalKobo)}
              </dd>
            </div>
          </dl>
          <p className="mt-8 text-body-sm text-ink-2">
            Questions about this order? Email{' '}
            <a
              href="mailto:support@tokslearn.com"
              className="text-brand underline underline-offset-4"
            >
              support@tokslearn.com
            </a>{' '}
            with the order number {order.publicId}.
          </p>
        </div>
      </div>
    </>
  )
}
