'use client'
// Client component: hide the reported post or review (settles its reports) or dismiss the reports
// (docs/20 `/admin/moderation`). Both are audit-logged.

import { Button } from '@tokslearn/ui/button'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

/** A reported discussion or reply (`reportId`) or a reported review (`reviewId`). */
export function ReportActions(props: { reportId: string } | { reviewId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState<'hide' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (action: 'hide' | 'dismiss') => {
    setPending(action)
    setError(null)
    try {
      if ('reviewId' in props) await api.admin.reviews.handle({ reviewId: props.reviewId, action })
      else await api.admin.moderation.handle({ reportId: props.reportId, action })
      router.refresh()
    } catch (e) {
      setError(apiErrorMessage(e))
      setPending(null)
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="danger"
          loading={pending === 'hide'}
          disabled={pending !== null}
          onClick={() => act('hide')}
        >
          Hide
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={pending === 'dismiss'}
          disabled={pending !== null}
          onClick={() => act('dismiss')}
        >
          Dismiss
        </Button>
      </div>
      {error ? <span className="text-caption text-danger">{error}</span> : null}
    </div>
  )
}
