'use client'
// Client component: the refund line under one course on the receipt (docs/20
// `/account/orders/[publicId]`): ask for a refund, why it can't be refunded, or where the
// existing request stands.

import type { ErrorCode, RefundCheckDto, RefundReason } from '@tokslearn/contract'
import { errorMessage } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { Label } from '@tokslearn/ui/label'
import { Select } from '@tokslearn/ui/select'
import { Textarea } from '@tokslearn/ui/textarea'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

const reasons: ReadonlyArray<[RefundReason, string]> = [
  ['not_as_described', 'It isn’t what the course page described'],
  ['quality', 'The teaching or videos weren’t good enough'],
  ['technical', 'Videos or files didn’t work for me'],
  ['duplicate', 'I bought it twice by mistake'],
  ['changed_mind', 'I changed my mind'],
  ['other', 'Something else'],
]

const statusText: Record<string, string> = {
  under_review: 'Refund request with our team',
  approved: 'Refund approved',
  processing: 'Refund on its way',
  processed: 'Refunded',
  denied: 'Refund declined',
  failed: 'Refund delayed: our team is on it',
}

export function RefundAction({ check }: { check: RefundCheckDto }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<RefundReason>('not_as_described')
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (check.existing) {
    return (
      <Link
        href={'/account/refunds' as Route}
        className="text-body-sm text-brand-ink hover:underline"
      >
        {statusText[check.existing.status] ?? 'See your refund'}
      </Link>
    )
  }
  if (!check.eligible) {
    return check.code ? (
      <p className="text-body-sm text-ink-3">
        {errorMessage(check.code as ErrorCode, check.details)}
      </p>
    ) : null
  }
  if (!open) {
    return (
      <button
        type="button"
        className="w-fit text-body-sm font-medium text-brand-ink hover:underline"
        onClick={() => setOpen(true)}
      >
        Request a refund
      </button>
    )
  }
  return (
    <form
      className="mt-2 flex flex-col gap-3 rounded-control border border-border bg-canvas p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setPending(true)
        setError(null)
        try {
          await api.refunds.request({
            orderItemId: check.orderItemId,
            reasonCode: reason,
            reasonText: text.trim() || null,
          })
          router.refresh()
        } catch (err) {
          setError(apiErrorMessage(err))
          setPending(false)
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`reason-${check.orderItemId}`}>What went wrong?</Label>
        <Select
          id={`reason-${check.orderItemId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value as RefundReason)}
        >
          {reasons.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`details-${check.orderItemId}`}>
          Anything else we should know? (optional)
        </Label>
        <Textarea
          id={`details-${check.orderItemId}`}
          rows={2}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <p className="text-body-sm text-ink-2">
        {check.decision === 'approve'
          ? 'You’ll get the money back to the card or account you paid with, and lose access to the course straight away.'
          : 'Our finance team will look at this one, usually within 2 working days.'}
      </p>
      {error ? (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Request refund
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
