'use client'
// Client component: finance actions on a payout run (docs/20 `/admin/payouts/[runId]`): draft,
// approve, co-sign, export, and per-row hold/release/retry. The server checks roles and 2FA.

import { Button, buttonClasses } from '@tokslearn/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorCode, apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'

function useAction(path: string) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; code: string | null } | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>, after?: (out: unknown) => void) => {
    setPending(key)
    setError(null)
    try {
      const out = await fn()
      if (after) after(out)
      else router.refresh()
    } catch (e) {
      setError({ message: apiErrorMessage(e), code: apiErrorCode(e) })
    } finally {
      setPending(null)
    }
  }
  const alert = error ? (
    <div className="flex flex-col gap-2">
      <FormAlert tone="error">{error.message}</FormAlert>
      {error.code === 'STEP_UP_REQUIRED' ? (
        <Link
          href={`/two-factor?next=${encodeURIComponent(path)}`}
          className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'self-start' })}
        >
          Enter my code
        </Link>
      ) : error.code === 'TWO_FACTOR_REQUIRED' ? (
        <Link
          href="/account/settings/security"
          className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'self-start' })}
        >
          Set up two-factor
        </Link>
      ) : null}
    </div>
  ) : null
  return { pending, run, alert, router }
}

/** "Draft this month's run" on the runs list. */
export function PreparePayoutRun({ label }: { label: string }) {
  const { pending, run, alert, router } = useAction('/admin/payouts')
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        variant="secondary"
        loading={pending === 'prepare'}
        onClick={() =>
          run(
            'prepare',
            () => api.admin.payouts.prepare(),
            (out) => router.push(`/admin/payouts/${(out as { runId: string }).runId}`),
          )
        }
      >
        {label}
      </Button>
      {alert}
    </div>
  )
}

export function PayoutRunActions(props: {
  runId: string
  canApprove: boolean
  canCosign: boolean
  canRedraft: boolean
}) {
  const path = `/admin/payouts/${props.runId}`
  const { pending, run, alert } = useAction(path)
  const exportCsv = async () => {
    const { filename, csv } = await api.admin.payouts.exportCsv({ runId: props.runId })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {props.canApprove ? (
          <Button
            loading={pending === 'approve'}
            disabled={pending !== null}
            onClick={() => run('approve', () => api.admin.payouts.approve({ runId: props.runId }))}
          >
            Approve run
          </Button>
        ) : null}
        {props.canCosign ? (
          <Button
            loading={pending === 'cosign'}
            disabled={pending !== null}
            onClick={() => run('cosign', () => api.admin.payouts.cosign({ runId: props.runId }))}
          >
            Co-sign run
          </Button>
        ) : null}
        {props.canRedraft ? (
          <Button
            variant="secondary"
            loading={pending === 'redraft'}
            disabled={pending !== null}
            onClick={() => run('redraft', () => api.admin.payouts.prepare())}
          >
            Rebuild draft
          </Button>
        ) : null}
        <Button
          variant="secondary"
          loading={pending === 'export'}
          disabled={pending !== null}
          onClick={() => run('export', exportCsv, () => {})}
        >
          Download CSV
        </Button>
      </div>
      {alert}
    </div>
  )
}

export function PayoutItemAction(props: {
  runId: string
  itemId: string
  action: 'hold' | 'release' | 'retry'
  name: string
}) {
  const { pending, run, alert } = useAction(`/admin/payouts/${props.runId}`)
  const label =
    props.action === 'hold' ? 'Hold' : props.action === 'release' ? 'Pay this month' : 'Send again'
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={props.action === 'retry' ? 'primary' : 'secondary'}
        loading={pending !== null}
        aria-label={`${label}: ${props.name}`}
        onClick={() =>
          run(props.action, () =>
            props.action === 'retry'
              ? api.admin.payouts.retry({ runId: props.runId, itemId: props.itemId })
              : api.admin.payouts.setHold({
                  runId: props.runId,
                  itemId: props.itemId,
                  hold: props.action === 'hold',
                }),
          )
        }
      >
        {label}
      </Button>
      {alert}
    </div>
  )
}
