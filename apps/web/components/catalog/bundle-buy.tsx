'use client'
// Client component: add a bundle to the cart or buy it now (docs/20 `/bundles/[slug]`).

import { buttonClasses } from '@tokslearn/ui/button'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { addLocal, cartChanged, isSignedIn, readLocalCart, shopApi } from '@/lib/shop'

export function BundleBuy({ bundleId }: { bundleId: string }) {
  const [inCart, setInCart] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setInCart(readLocalCart().some((i) => i.itemType === 'bundle' && i.itemId === bundleId))
  }, [bundleId])

  const add = async () => {
    if (isSignedIn()) {
      const cart = await shopApi<{ items: unknown[] }>('/cart/items', {
        method: 'POST',
        body: { itemType: 'bundle', itemId: bundleId },
      })
      cartChanged(cart.items.length)
    } else {
      addLocal({ itemType: 'bundle', itemId: bundleId })
    }
    setInCart(true)
  }

  const run = async (then?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      if (!inCart) await add()
      then?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {inCart ? (
        <Link href="/cart" className={buttonClasses({ size: 'lg', className: 'w-full' })}>
          Go to cart
        </Link>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => run()}
          className={buttonClasses({ size: 'lg', className: 'w-full' })}
        >
          Add to cart
        </button>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          run(() =>
            window.location.assign(
              isSignedIn() ? '/checkout' : `/sign-in?next=${encodeURIComponent('/checkout')}`,
            ),
          )
        }
        className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'w-full' })}
      >
        Buy now
      </button>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
