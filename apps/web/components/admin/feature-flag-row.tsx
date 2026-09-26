'use client'
// Client component: toggling a flag is an interactive mutation through the oRPC API.

import { useMutation } from '@tanstack/react-query'
import { Button } from '@tokslearn/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@tokslearn/ui/dialog'
import { Switch } from '@tokslearn/ui/switch'
import { useState } from 'react'
import { apiErrorMessage } from '@/lib/api-error'
import { orpc } from '@/lib/orpc'

/** Flags whose "on" state affects every visitor right away need a second click. */
const confirmOnEnable: Readonly<Record<string, string>> = {
  maintenance_mode:
    'Everyone except staff will see the maintenance page until you turn this off. Payments and lessons in progress will stop.',
}

const lagos = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function FeatureFlagRow({
  flagKey,
  description,
  enabled: initialEnabled,
  updatedAt: initialUpdatedAt,
}: {
  flagKey: string
  description: string
  enabled: boolean
  updatedAt: string
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt)
  const mutation = useMutation(
    orpc.admin.setFeatureFlag.mutationOptions({
      onSuccess: (flag) => {
        setEnabled(flag.enabled)
        setUpdatedAt(flag.updatedAt)
      },
      onError: (_error, variables) => setEnabled(!variables.enabled),
    }),
  )

  const [confirming, setConfirming] = useState(false)

  const change = (next: boolean) => {
    setEnabled(next)
    mutation.mutate({ key: flagKey, enabled: next })
  }

  const request = (next: boolean) => {
    if (next && confirmOnEnable[flagKey]) setConfirming(true)
    else change(next)
  }

  const id = `flag-${flagKey}`
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <label htmlFor={id} className="block font-mono text-body-sm font-medium text-ink">
            {flagKey}
          </label>
          <p id={`${id}-desc`} className="mt-0.5 text-body-sm text-ink-2">
            {description || 'No description.'}{' '}
            <span className="text-ink-3">
              Last changed {lagos.format(new Date(updatedAt))} (Lagos time).
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="w-7 text-body-sm font-medium text-ink-2" aria-hidden>
            {enabled ? 'On' : 'Off'}
          </span>
          <Switch
            id={id}
            checked={enabled}
            disabled={mutation.isPending}
            aria-describedby={`${id}-desc`}
            onChange={(e) => request(e.currentTarget.checked)}
          />
        </div>
      </div>
      {mutation.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-control bg-danger-soft px-3 py-2"
        >
          <p className="text-body-sm text-danger">{apiErrorMessage(mutation.error)}</p>
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => change(mutation.variables?.enabled ?? !enabled)}
          >
            Try again
          </Button>
        </div>
      ) : null}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent title={`Turn on ${flagKey}?`} description={confirmOnEnable[flagKey]}>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Keep it off</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false)
                change(true)
              }}
            >
              Turn on {flagKey}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
