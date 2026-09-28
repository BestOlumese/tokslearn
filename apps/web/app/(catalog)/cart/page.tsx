import * as commerce from '@tokslearn/core/commerce'
import { isUser } from '@tokslearn/core/kernel'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CartView } from '@/components/shop/cart-view'
import { PageHeader } from '@/components/site/page-header'
import { getServerCtx } from '@/lib/server-ctx'
import { toCartDto } from '@/lib/shop-dto'

export const metadata: Metadata = { title: 'Cart', robots: { index: false } }

// docs/20 `/cart`. Server-rendered for signed-in users; visitors' browser carts are priced by the
// client island through cart.preview.
export default function CartPage() {
  return (
    <>
      <PageHeader title="Cart" width="catalog" />
      <div className="mx-auto max-w-catalog px-4 pb-16 sm:px-6 lg:px-8">
        <Suspense
          fallback={<div className="mt-8 h-40 animate-pulse rounded-card bg-surface-sunken" />}
        >
          <Cart />
        </Suspense>
      </div>
    </>
  )
}

async function Cart() {
  const ctx = await getServerCtx()
  if (!isUser(ctx.actor)) return <CartView initial={null} signedIn={false} />
  return <CartView initial={toCartDto(await commerce.getCart(ctx))} signedIn />
}
