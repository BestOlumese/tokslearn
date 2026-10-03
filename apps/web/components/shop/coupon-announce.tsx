'use client'
// Client component: tell the people who saved the coupon's course(s) about it (ADR-042). Once per
// coupon; they get a notice, and an email if they asked for price drops.

import { Button } from '@tokslearn/ui/button'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/studio/confirm-dialog'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function CouponAnnounce({ couponId, code }: { couponId: string; code: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant="tertiary" onClick={() => setOpen(true)}>
        Tell people who saved it
      </Button>
      {error ? <span className="text-caption text-danger">{error}</span> : null}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Share ${code} with people who saved your course?`}
        description="Everyone with the course on their wishlist (and not enrolled) gets a notice with the new price and the code, and an email if they asked for price drops. You can do this once per coupon."
        confirmLabel="Share the coupon"
        tone="primary"
        onConfirm={async () => {
          setError(null)
          try {
            await api.studio.coupons.announce({ couponId })
            router.refresh()
          } catch (e) {
            setError(apiErrorMessage(e))
          }
        }}
      />
    </span>
  )
}
