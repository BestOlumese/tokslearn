'use client'
// Client component: on the Wishlist tab, the opt-in for price-drop emails (ADR-042). The same
// setting as Settings → Notifications → Wishlist price drops.

import { Switch } from '@tokslearn/ui/switch'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function PriceDropOptIn({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <Switch
          id="price-drop-email"
          checked={on}
          onChange={async (e) => {
            const next = e.target.checked
            setOn(next)
            setError(null)
            try {
              await api.notifications.preferences.set({
                type: 'wishlist.price_drop',
                channel: 'email',
                enabled: next,
              })
            } catch (err) {
              setOn(!next)
              setError(apiErrorMessage(err))
            }
          }}
        />
        <label htmlFor="price-drop-email" className="text-body-sm text-ink">
          Email me when a course here gets cheaper or its instructor shares a coupon
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
