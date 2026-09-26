'use client'
// Client component: application step 5, check everything and submit.

import { useMutation } from '@tanstack/react-query'
import type { ApplicationDto, MyApplicationDto } from '@tokslearn/contract'
import { Button } from '@tokslearn/ui/button'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { orpc } from '@/lib/orpc'

type Gap = ApplicationDto['gaps'][number]

const gapStep: Readonly<Record<Gap, { label: string; step: number }>> = {
  about: { label: 'About you', step: 0 },
  expertise: { label: 'Expertise and sample', step: 1 },
  kyc: { label: 'Identity', step: 2 },
  bank: { label: 'Bank account', step: 3 },
}

export function ReviewStep({
  state,
  onSaved,
  goTo,
}: {
  state: MyApplicationDto
  onSaved: (next: MyApplicationDto) => void
  goTo: (step: number) => void
}) {
  const app = state.application
  const gaps: Gap[] = app?.gaps ?? ['about', 'expertise', 'kyc', 'bank']
  const [error, setError] = useState<string | null>(null)
  const submit = useMutation(
    orpc.instructors.submitApplication.mutationOptions({
      onSuccess: onSaved,
      onError: (e) => setError(apiErrorMessage(e)),
    }),
  )

  const rows: Array<{ label: string; value: string; step: number }> = [
    { label: 'Headline', value: app?.about.headline ?? '—', step: 0 },
    { label: 'Topics', value: app?.about.topics?.join(', ') ?? '—', step: 0 },
    { label: 'Sample', value: app?.sampleUrl ?? '—', step: 1 },
    {
      label: 'Identity',
      value:
        state.kyc?.status === 'verified'
          ? `Verified (${state.kyc.matchedName ?? ''})`
          : state.kyc?.status === 'manual_review'
            ? 'Found; a reviewer will check it'
            : 'Not verified yet',
      step: 2,
    },
    {
      label: 'Bank account',
      value: state.payoutAccount
        ? `${state.payoutAccount.bankName} •••• ${state.payoutAccount.accountNumberLast4}`
        : 'Not added yet',
      step: 3,
    },
  ]

  return (
    <SettingsPanel
      id="step-review"
      title="Review and submit"
      description="A reviewer usually decides within 3 working days. You can't edit the application while it's in review."
      footer={
        <Button
          loading={submit.isPending}
          disabled={gaps.length > 0}
          onClick={() => {
            setError(null)
            submit.mutate({})
          }}
        >
          Submit application
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {error ? <FormAlert tone="error">{error}</FormAlert> : null}
        {gaps.length > 0 ? (
          <FormAlert tone="info">
            Finish these first:{' '}
            {gaps.map((g, i) => (
              <span key={g}>
                {i > 0 ? ', ' : null}
                <button
                  type="button"
                  className="font-medium text-brand-ink underline underline-offset-4"
                  onClick={() => goTo(gapStep[g].step)}
                >
                  {gapStep[g].label}
                </button>
              </span>
            ))}
          </FormAlert>
        ) : null}
        <dl className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr_auto] sm:gap-4">
              <dt className="text-body-sm text-ink-2">{r.label}</dt>
              <dd className="min-w-0 break-words text-body text-ink">{r.value}</dd>
              <dd>
                <button
                  type="button"
                  className="text-body-sm font-medium text-brand-ink underline-offset-4 hover:underline"
                  onClick={() => goTo(r.step)}
                >
                  Edit<span className="sr-only"> {r.label}</span>
                </button>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </SettingsPanel>
  )
}
