'use client'
// Client component: the pay step (docs/20 `/checkout`, docs/08 §6). The server prices the cart
// again; we send only the total the buyer saw. Paystack's popup opens with the access code;
// success goes to /checkout/success, which confirms the payment with Paystack.

import { buttonClasses } from '@tokslearn/ui/button'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { capture } from '@/lib/analytics'
import { formatNaira } from '@/lib/format'
import { cartChanged, readLocalCart, ShopError, shopApi, writeLocalCart } from '@/lib/shop'

interface StartResult {
  publicId: string
  status: 'pending' | 'paid' | 'failed'
  accessCode: string | null
}

interface PaystackPopup {
  resumeTransaction(
    accessCode: string,
    callbacks: {
      onSuccess: (tx: { reference: string }) => void
      onCancel: () => void
      onError?: (error: { message?: string }) => void
    },
  ): void
}

declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopup
  }
}

const SCRIPT = 'https://js.paystack.co/v2/inline.js'

/** Loads Paystack's popup script once, on demand (it only matters on this page). */
function loadPaystack(): Promise<new () => PaystackPopup> {
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () =>
      window.PaystackPop ? resolve(window.PaystackPop) : reject(new Error('Paystack unavailable'))
    script.onerror = () => reject(new Error('Paystack unavailable'))
    document.head.append(script)
  })
}

export function CheckoutPay({
  totalKobo,
  anonymousId,
  testMode,
}: {
  totalKobo: string
  anonymousId: string | null
  /** No Paystack keys (local development): payments are approved without the popup. */
  testMode: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const key = useRef<string>('')

  // A browser cart from before sign-in joins the order first.
  useEffect(() => {
    const local = readLocalCart()
    if (local.length === 0) return
    shopApi('/cart/merge', { method: 'POST', body: { items: local } })
      .then(() => {
        writeLocalCart([])
        router.refresh()
      })
      .catch(() => undefined)
  }, [router])

  const success = (reference: string) =>
    router.push(`/checkout/success?ref=${encodeURIComponent(reference)}` as Route)

  const pay = async () => {
    setBusy(true)
    setMessage(null)
    key.current ||= crypto.randomUUID()
    try {
      const order = await shopApi<StartResult>('/checkout', {
        method: 'POST',
        body: { expectedTotalKobo: totalKobo, idempotencyKey: key.current, anonymousId },
      })
      if (order.status === 'paid') {
        cartChanged(0)
        success(order.publicId)
        return
      }
      if (!order.accessCode)
        throw new ShopError('PAYMENT_NOT_CONFIRMED', 'Payment could not start.')
      if (testMode) {
        success(order.publicId)
        return
      }
      const Popup = await loadPaystack()
      new Popup().resumeTransaction(order.accessCode, {
        onSuccess: () => {
          cartChanged(0)
          success(order.publicId)
        },
        onCancel: () => {
          capture('payment_popup_closed', { order_id: order.publicId })
          setBusy(false)
          setMessage(
            "Payment not completed. You haven't been charged. Try again when you're ready.",
          )
        },
        onError: () => {
          setBusy(false)
          setMessage('Paystack had a problem opening the payment. Try again in a moment.')
        },
      })
    } catch (e) {
      setBusy(false)
      if (e instanceof ShopError && e.code === 'CART_CHANGED') {
        key.current = ''
        setMessage('Your cart changed. Check the new total, then pay.')
        router.refresh()
        return
      }
      setMessage(
        e instanceof ShopError
          ? e.message
          : 'Payments are temporarily unavailable. Your cart is saved; try again in a few minutes.',
      )
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className={buttonClasses({ size: 'lg', className: 'w-full' })}
      >
        {busy
          ? 'Opening payment…'
          : totalKobo === '0'
            ? 'Get it free'
            : `Pay ${formatNaira(totalKobo)}`}
      </button>
      {testMode ? (
        <p className="text-body-sm text-warning">
          Test mode: no Paystack keys on this server, so payments are approved without charging.
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-body-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  )
}
