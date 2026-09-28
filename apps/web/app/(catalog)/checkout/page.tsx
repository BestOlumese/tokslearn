import * as commerce from '@tokslearn/core/commerce'
import { getMe } from '@tokslearn/core/identity'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Metadata, Route } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Suspense } from 'react'
import { CheckoutPay } from '@/components/shop/checkout-pay'
import { PageHeader } from '@/components/site/page-header'
import { env } from '@/env'
import { ANON_COOKIE, readAnonymousId } from '@/lib/anonymous-id'
import { formatNaira } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } }

// docs/20 `/checkout`: order summary, where the receipt goes, refund rules, pay button. Prices
// come from the server's cart; the pay step prices it again before Paystack opens.
export default function CheckoutPage() {
  return (
    <>
      <PageHeader title="Checkout" width="catalog" />
      <div className="mx-auto max-w-catalog px-4 pb-16 sm:px-6 lg:px-8">
        <Suspense
          fallback={<div className="mt-8 h-64 animate-pulse rounded-card bg-surface-sunken" />}
        >
          <Checkout />
        </Suspense>
      </div>
    </>
  )
}

const refundText = (days: number) =>
  days === 0
    ? 'No refunds'
    : `Refund within ${days} days if you've watched less than 30% and downloaded no main files`

async function Checkout() {
  const ctx = await requireSignedInCtx('/checkout')
  const [cart, me, jar] = await Promise.all([commerce.getCart(ctx), getMe(ctx), cookies()])

  if (cart.items.length === 0) {
    return (
      <EmptyState
        className="mt-8"
        title="Nothing to pay for"
        description="Your cart is empty. Add a course, then come back here."
        action={
          <Link href="/courses" className={buttonClasses({ variant: 'secondary' })}>
            Browse courses
          </Link>
        }
      />
    )
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section
        aria-labelledby="order-title"
        className="rounded-card border border-border bg-surface"
      >
        <h2 id="order-title" className="border-b border-border px-5 py-4 text-h4 text-ink">
          Your order
        </h2>
        <ul className="divide-y divide-border">
          {cart.items.map((item) => (
            <li
              key={`${item.itemType}:${item.itemId}`}
              className="flex justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-body font-medium text-ink">{item.title}</p>
                <p className="mt-0.5 text-body-sm text-ink-2">
                  {refundText(item.refundPolicyDays)}
                </p>
              </div>
              <p className="shrink-0 text-body text-ink">{formatNaira(item.priceKobo)}</p>
            </li>
          ))}
        </ul>
        {cart.removed.length > 0 ? (
          <p className="border-t border-border px-5 py-3 text-body-sm text-ink-2">
            We took out {cart.removed.map((r) => r.title).join(', ')}: you already have it or it's
            no longer on sale.
          </p>
        ) : null}
      </section>

      <aside
        aria-label="Payment"
        className="flex flex-col gap-4 self-start rounded-card border border-border bg-surface p-6"
      >
        <dl className="flex flex-col gap-2 text-body-sm">
          <div className="flex justify-between">
            <dt className="text-ink-2">Subtotal</dt>
            <dd className="text-ink">{formatNaira(cart.subtotalKobo)}</dd>
          </div>
          {cart.discountKobo > 0n ? (
            <div className="flex justify-between">
              <dt className="text-ink-2">Coupon {cart.couponCode}</dt>
              <dd className="text-ink">−{formatNaira(cart.discountKobo)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-border pt-3">
            <dt className="text-body font-semibold text-ink">Total</dt>
            <dd className="text-h3 text-ink">{formatNaira(cart.totalKobo)}</dd>
          </div>
        </dl>
        <CheckoutPay
          totalKobo={cart.totalKobo.toString()}
          anonymousId={readAnonymousId(jar.get(ANON_COOKIE)?.value)}
          testMode={!env.PAYSTACK_SECRET_KEY && env.NEXT_PUBLIC_APP_ENV !== 'production'}
        />
        <p className="text-body-sm text-ink-2">
          The receipt goes to <span className="text-ink">{me.email}</span>. Card, bank transfer and
          USSD are handled by Paystack; we never see your card details.
        </p>
        <Link
          href={'/cart' as Route}
          className="text-body-sm font-medium text-brand hover:underline"
        >
          Back to cart
        </Link>
      </aside>
    </div>
  )
}
