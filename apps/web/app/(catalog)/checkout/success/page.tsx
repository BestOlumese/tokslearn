import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CheckoutStatus } from '@/components/shop/checkout-status'
import { PageHeader } from '@/components/site/page-header'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Order confirmation', robots: { index: false } }

type Search = Promise<{ ref?: string }>

// docs/20 `/checkout/success`: confirms the payment (polling up to 60 s), then shows the courses
// with "Start learning" and a receipt link.
export default function CheckoutSuccessPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader title="Order confirmation" width="catalog" />
      <div className="mx-auto max-w-catalog px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <Suspense fallback={null}>
          <Status searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  )
}

async function Status({ searchParams }: { searchParams: Search }) {
  const { ref } = await searchParams
  await requireSignedInCtx(`/checkout/success${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`)
  if (!ref || !/^TL-[0-9A-Z]{8}$/.test(ref)) {
    return <p className="text-body text-ink-2">This link is missing its order number.</p>
  }
  return <CheckoutStatus reference={ref} />
}
