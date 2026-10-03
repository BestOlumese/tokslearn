'use client'
// Client component: the one button on /unsubscribe. A button, not the link itself, so email
// scanners that open links don't unsubscribe people. No UI kit: public page, small budget.

import { useState } from 'react'

export function UnsubscribeButton({
  userId,
  type,
  signature,
}: {
  userId: string
  type: string
  signature: string
}) {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
  if (state === 'done') {
    return (
      <p role="status" className="text-body text-ink">
        Done. You won’t get these emails any more. You can turn them back on in Settings →
        Notifications.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={state === 'pending'}
        className="inline-flex h-10 w-fit items-center rounded-control bg-brand px-4 text-body-sm font-medium text-ink-inverse hover:bg-brand-hover disabled:opacity-40"
        onClick={async () => {
          setState('pending')
          const res = await fetch('/api/v1/notifications/unsubscribe', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ userId, type, signature }),
          }).catch(() => null)
          setState(res?.ok ? 'done' : 'error')
        }}
      >
        Stop these emails
      </button>
      {state === 'error' ? (
        <p role="alert" className="text-body-sm text-danger">
          That link didn’t work. Sign in and change it in Settings → Notifications.
        </p>
      ) : null}
    </div>
  )
}
