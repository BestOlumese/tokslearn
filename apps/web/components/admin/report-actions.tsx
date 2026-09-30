'use client'
// Client component: hide the reported post (settles its reports) or dismiss the reports
// (docs/20 `/admin/moderation`). Both are audit-logged.

import { Button } from '@tokslearn/ui/button'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState<'hide' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (action: 'hide' | 'dismiss') => {
    setPending(action)
    setError(null)
    try {
      await api.admin.moderation.handle({ reportId, action })
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
