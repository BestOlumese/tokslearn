'use client'
// Client component: the one appeal for a declined refund (docs/08 §7). Finance decides.

import { Button } from '@tokslearn/ui/button'
import { Label } from '@tokslearn/ui/label'
import { Textarea } from '@tokslearn/ui/textarea'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function AppealForm({ refundId }: { refundId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!open) {
    return (
      <Button size="sm" variant="secondary" className="w-fit" onClick={() => setOpen(true)}>
        Appeal this decision
      </Button>
    )
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        setError(null)
        try {
          await api.refunds.appeal({ refundId, text })
          router.refresh()
        } catch (err) {
          setError(apiErrorMessage(err))
          setPending(false)
        }
      }}
    >
      <Label htmlFor={`appeal-${refundId}`}>
        Tell our finance team why this should be refunded. You can appeal once.
      </Label>
      <Textarea
        id={`appeal-${refundId}`}
        rows={3}
        required
        minLength={10}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Send appeal
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
