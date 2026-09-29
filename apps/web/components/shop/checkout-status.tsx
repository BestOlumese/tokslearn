'use client'
// Client component: after Paystack (docs/20 `/checkout/success`). Asks the server to confirm the
// payment; transfers can take a minute, so it keeps asking for up to 60 seconds.

import { buttonClasses } from '@tokslearn/ui/button'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { cartChanged, ShopError, shopApi } from '@/lib/shop'

type Result = {
  status: 'paid' | 'pending' | 'failed'
  publicId: string
  courses: Array<{ id: string; slug: string; title: string }>
}

const POLL_MS = 3000
const GIVE_UP_MS = 60_000

export function CheckoutStatus({ reference }: { reference: string }) {
  const [result, setResult] = useState<Result | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    const started = Date.now()
    const check = async () => {
      try {
        const r = await shopApi<Result>('/checkout/confirm', {
          method: 'POST',
          body: { reference },
        })
        if (stopped) return
        setResult(r)
        if (r.status === 'paid') {
          cartChanged(0)
          return
        }
        if (r.status === 'failed') return
      } catch (e) {
        if (stopped) return
        // A provider hiccup is worth retrying; anything else is final.
        if (!(e instanceof ShopError && e.code === 'PAYMENT_PROVIDER_UNAVAILABLE')) {
          setError(e instanceof Error ? e.message : String(e))
          return
        }
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setGaveUp(true)
        return
      }
      setTimeout(check, POLL_MS)
    }
    void check()
    return () => {
      stopped = true
    }
  }, [reference])

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <h2 className="text-h3 text-ink">We couldn't confirm this payment</h2>
        <p role="alert" className="text-body text-ink-2">
          {error}
        </p>
        <Link href="/account/orders" className={buttonClasses({ variant: 'secondary' })}>
          See my orders
        </Link>
      </div>
    )
  }

  if (result?.status === 'paid') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-h2 text-ink">You're enrolled</h2>
          <p className="mt-2 text-body text-ink-2">
            Payment confirmed for order {result.publicId}. We've emailed your receipt.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {result.courses.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <span className="text-body font-medium text-ink">{c.title}</span>
              <Link href={`/learn/${c.slug}` as Route} className={buttonClasses({ size: 'sm' })}>
                Start learning
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={`/account/orders/${result.publicId}` as Route}
          className="text-body-sm font-medium text-brand hover:underline"
        >
          View receipt
        </Link>
      </div>
    )
  }

  if (result?.status === 'failed') {
    return (
      <div className="flex flex-col items-start gap-4">
        <h2 className="text-h3 text-ink">Your payment didn't go through</h2>
        <p className="text-body text-ink-2">You haven't been charged. Your cart is saved.</p>
        <Link href="/cart" className={buttonClasses()}>
          Back to cart
        </Link>
      </div>
    )
  }

  if (gaveUp) {
    return (
      <div className="flex flex-col items-start gap-4">
        <h2 className="text-h3 text-ink">Your payment is still being confirmed</h2>
        <p className="max-w-prose text-body text-ink-2">
          Bank transfers can take a few minutes. We'll email you as soon as Paystack confirms it,
          and the course will appear in My learning. You don't need to pay again.
        </p>
        <Link href="/account/orders" className={buttonClasses({ variant: 'secondary' })}>
          See my orders
        </Link>
      </div>
    )
  }

  return (
    <div aria-live="polite" className="flex items-center gap-3 text-body text-ink-2">
      <span
        aria-hidden
        className="size-5 animate-spin rounded-full border-2 border-border border-t-brand"
      />
      Confirming your payment with Paystack…
    </div>
  )
}
