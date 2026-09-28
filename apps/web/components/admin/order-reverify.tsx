'use client'
// Client component: "Check with Paystack again" on an order (admin.orders.reverify).

import { Button } from '@tokslearn/ui/button'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function OrderReverify({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={async () => {
          setPending(true)
          setMessage(null)
          try {
            const r = await api.admin.orders.reverify({ orderId })
            setMessage(
              r.status === 'paid'
                ? 'Paystack confirms it was paid. The buyer is enrolled.'
                : r.status === 'failed'
                  ? 'Paystack says this payment failed.'
                  : 'Paystack has no successful payment for this order yet.',
            )
            router.refresh()
          } catch (e) {
            setMessage(apiErrorMessage(e))
          } finally {
            setPending(false)
          }
        }}
      >
        Check with Paystack again
      </Button>
      {message ? (
        <p role="status" className="text-body-sm text-ink-2">
          {message}
        </p>
      ) : null}
    </div>
  )
}
