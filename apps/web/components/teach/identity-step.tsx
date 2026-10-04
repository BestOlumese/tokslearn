'use client'
// Client component: application step 3, identity check (BVN or NIN + selfie, docs/07 §5).

import { useMutation } from '@tanstack/react-query'
import type { MyApplicationDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { Radio } from '@tokslearn/ui/radio'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api, orpc } from '@/lib/orpc'
import { SelfieCapture } from './selfie-capture'

export function IdentityStep({
  state,
  onSaved,
  onContinue,
}: {
  state: MyApplicationDto
  onSaved: (next: MyApplicationDto) => void
  /** The wizard's next step; absent on `/teach/settings`. */
  onContinue?: () => void
}) {
  const kyc = state.kyc
  const [method, setMethod] = useState<'bvn' | 'nin'>(kyc?.method ?? 'bvn')
  const [selfie, setSelfie] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const verify = useMutation(
    orpc.kyc.start.mutationOptions({
      onSuccess: async () => onSaved(await api.instructors.getMyApplication()),
      onError: async (e) => {
        setError(apiErrorMessage(e))
        // A failed check is still recorded; refresh so the status shows it.
        onSaved(await api.instructors.getMyApplication())
      },
    }),
  )

  if (kyc && (kyc.status === 'verified' || kyc.status === 'manual_review')) {
    return (
      <SettingsPanel
        id="step-identity"
        title="Identity"
        description={
          kyc.status === 'verified'
            ? 'Your identity is verified.'
            : 'We found your record. A reviewer will compare your selfie and name by hand when they look at your application; you can carry on.'
        }
        footer={onContinue ? <Button onClick={onContinue}>Continue</Button> : undefined}
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-body-sm text-ink-2">Checked with</dt>
            <dd className="mt-1 text-body text-ink">{kyc.method === 'bvn' ? 'BVN' : 'NIN'}</dd>
          </div>
          <div>
            <dt className="text-body-sm text-ink-2">Name on the record</dt>
            <dd className="mt-1 text-body text-ink">{kyc.matchedName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-body-sm text-ink-2">Result</dt>
            <dd className="mt-1">
              {kyc.status === 'verified' ? (
                <Badge tone="brand">Verified</Badge>
              ) : (
                <Badge tone="warning">Manual review</Badge>
              )}
            </dd>
          </div>
        </dl>
      </SettingsPanel>
    )
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const number = String(new FormData(event.currentTarget).get('number') ?? '').replace(/\D/g, '')
    if (number.length !== 11) {
      setError(`Enter the 11-digit ${method === 'bvn' ? 'BVN' : 'NIN'}.`)
      return
    }
    if (!selfie) {
      setError('Take a selfie so we can match it to your record.')
      return
    }
    setError(null)
    verify.mutate({ method, number, selfieImage: selfie })
  }

  return (
    <form onSubmit={submit}>
      <SettingsPanel
        id="step-identity"
        title="Identity"
        description="Every instructor confirms who they are before they can sell. We send your number to our verification partner, Dojah, for this check and never store it."
        footer={
          <Button type="submit" loading={verify.isPending}>
            Verify my identity
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-body-sm font-medium text-ink">Check with</legend>
            {(
              [
                ['bvn', 'BVN', 'Bank Verification Number. Dial *565*0# to see yours.'],
                ['nin', 'NIN', 'National Identification Number, on your NIN slip or NIMC app.'],
              ] as const
            ).map(([value, label, hint]) => (
              <div key={value} className="flex items-start gap-3">
                <Radio
                  id={`method-${value}`}
                  name="method"
                  value={value}
                  checked={method === value}
                  onChange={() => setMethod(value)}
                  className="mt-0.5"
                />
                <Label htmlFor={`method-${value}`} kind="option">
                  <span className="font-medium text-ink">{label}</span>
                  <span className="block text-body-sm text-ink-2">{hint}</span>
                </Label>
              </div>
            ))}
          </fieldset>
          <Field id="number" label={method === 'bvn' ? 'Your BVN' : 'Your NIN'}>
            {(p) => (
              <Input
                name="number"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                pattern="[0-9 ]{11,13}"
                maxLength={13}
                required
                className="max-w-xs tabular-nums"
                {...p}
              />
            )}
          </Field>
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-medium text-ink">Selfie</p>
            <SelfieCapture value={selfie} onChange={setSelfie} />
          </div>
          {kyc?.status === 'failed' ? (
            <p className="text-body-sm text-ink-2">
              Your last check didn't find a record. Check the number, or try the other ID type.
            </p>
          ) : null}
        </div>
      </SettingsPanel>
    </form>
  )
}
