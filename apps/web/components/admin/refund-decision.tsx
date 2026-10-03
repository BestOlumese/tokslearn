'use client'
// Client component: finance's decision on a refund request, or a retry after Paystack failed.
// Audit-logged on the server.

import { Button } from '@tokslearn/ui/button'
import { Label } from '@tokslearn/ui/label'
import { Textarea } from '@tokslearn/ui/textarea'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function RefundDecision({ refundId, mode }: { refundId: string; mode: 'decide' | 'retry' }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<'approve' | 'deny' | 'retry' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (which: 'approve' | 'deny' | 'retry') => {
    setPending(which)
    setError(null)
    try {
      if (which === 'retry') await api.admin.refunds.retry({ refundId })
      else await api.admin.refunds.decide({ refundId, approve: which === 'approve', reason })
      router.refresh()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setPending(null)
    }
  }
  if (mode === 'retry') {
    return (
      <div className="flex flex-col gap-2">
        <Button className="w-fit" loading={pending === 'retry'} onClick={() => run('retry')}>
          Send the refund again
        </Button>
        {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="refund-reason">Your reason (the learner reads this)</Label>
        <Textarea
          id="refund-reason"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          loading={pending === 'approve'}
          disabled={pending !== null || reason.trim().length < 3}
          onClick={() => run('approve')}
        >
          Approve refund
        </Button>
        <Button
          variant="secondary"
          loading={pending === 'deny'}
          disabled={pending !== null || reason.trim().length < 3}
          onClick={() => run('deny')}
        >
          Decline
        </Button>
      </div>
    </div>
  )
}
