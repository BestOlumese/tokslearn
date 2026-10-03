'use client'
// Client component: fetches a 5-minute link to a monthly statement PDF and opens it.

import { useMutation } from '@tanstack/react-query'
import { Button } from '@tokslearn/ui/button'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

export function StatementDownload({ month, label }: { month: string; label: string }) {
  const open = useMutation({
    mutationFn: () => api.earnings.statementUrl({ month }),
    onSuccess: ({ url }) => window.location.assign(url),
  })
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={open.isPending}
        onClick={() => open.mutate()}
        aria-label={`Download the ${label} statement`}
      >
        Download PDF
      </Button>
      {open.isError ? (
        <p role="alert" className="text-body-sm text-danger">
          {apiErrorMessage(open.error)}
        </p>
      ) : null}
    </div>
  )
}
