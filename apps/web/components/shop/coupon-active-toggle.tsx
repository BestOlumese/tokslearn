'use client'
// Client component: switch a coupon off or on (studio or admin procedure).

import { Button } from '@tokslearn/ui/button'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function CouponActiveToggle({
  couponId,
  code,
  active,
  mode,
}: {
  couponId: string
  code: string
  active: boolean
  mode: 'studio' | 'admin'
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="tertiary"
        loading={pending}
        aria-label={`${active ? 'Switch off' : 'Switch on'} ${code}`}
        onClick={async () => {
          setPending(true)
          setError(null)
          const input = { couponId, active: !active }
          try {
            if (mode === 'studio') await api.studio.coupons.setActive(input)
            else await api.admin.coupons.setActive(input)
            router.refresh()
          } catch (e) {
            setError(apiErrorMessage(e))
          } finally {
            setPending(false)
          }
        }}
      >
        {active ? 'Switch off' : 'Switch on'}
      </Button>
      {error ? <span className="text-caption text-danger">{error}</span> : null}
    </span>
  )
}
