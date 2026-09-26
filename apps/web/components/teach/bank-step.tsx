'use client'
// Client component: application step 4, the payout bank account (docs/07 §5 step 4).

import { useMutation, useQuery } from '@tanstack/react-query'
import { errorMessage, type MyApplicationDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Select } from '@tokslearn/ui/select'
import { useState } from 'react'
import { SettingsPanel } from '@/components/account/settings-panel'
import { FormAlert } from '@/components/auth/form-alert'
import { apiErrorMessage } from '@/lib/api-error'
import { api, orpc } from '@/lib/orpc'

export function BankStep({
  state,
  onSaved,
  onContinue,
  onVerifyIdentity,
}: {
  state: MyApplicationDto
  onSaved: (next: MyApplicationDto) => void
  onContinue: () => void
  onVerifyIdentity: () => void
}) {
  const account = state.payoutAccount
  const identityDone = state.kyc?.status === 'verified' || state.kyc?.status === 'manual_review'
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const banks = useQuery({
    ...orpc.payoutAccounts.listBanks.queryOptions(),
    enabled: identityDone && !account,
    staleTime: 60 * 60 * 1000,
  })
  const resolve = useMutation(
    orpc.payoutAccounts.resolve.mutationOptions({
      onSuccess: (r) => setResolvedName(r.accountName),
      onError: (e) => setError(apiErrorMessage(e)),
    }),
  )
  const add = useMutation(
    orpc.payoutAccounts.add.mutationOptions({
      onSuccess: async () => onSaved(await api.instructors.getMyApplication()),
      onError: (e) => setError(apiErrorMessage(e)),
    }),
  )

  if (!identityDone) {
    return (
      <SettingsPanel
        id="step-bank"
        title="Bank account"
        description="We check the account name against your verified identity, so verify your identity first."
        footer={
          <Button variant="secondary" onClick={onVerifyIdentity}>
            Go to identity
          </Button>
        }
      />
    )
  }

  if (account) {
    return (
      <SettingsPanel
        id="step-bank"
        title="Bank account"
        description={
          account.status === 'active'
            ? 'Payouts go to this account on the 5th of each month.'
            : errorMessage('BANK_NAME_MISMATCH')
        }
        footer={<Button onClick={onContinue}>Continue</Button>}
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-body-sm text-ink-2">Bank</dt>
            <dd className="mt-1 text-body text-ink">{account.bankName}</dd>
          </div>
          <div>
            <dt className="text-body-sm text-ink-2">Account</dt>
            <dd className="mt-1 text-body text-ink tabular-nums">
              •••• {account.accountNumberLast4}
            </dd>
          </div>
          <div>
            <dt className="text-body-sm text-ink-2">Name</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 text-body text-ink">
              {account.accountName}
              {account.status === 'active' ? (
                <Badge tone="brand">Matches</Badge>
              ) : (
                <Badge tone="warning">Manual review</Badge>
              )}
            </dd>
          </div>
        </dl>
      </SettingsPanel>
    )
  }

  const lookUp = (code: string, number: string) => {
    setResolvedName(null)
    setError(null)
    if (code && /^\d{10}$/.test(number)) resolve.mutate({ bankCode: code, accountNumber: number })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!resolvedName) return
        setError(null)
        add.mutate({ bankCode, accountNumber })
      }}
    >
      <SettingsPanel
        id="step-bank"
        title="Bank account"
        description="Where we send your earnings. The account must be in your name; we compare it with your verified identity."
        footer={
          <Button type="submit" loading={add.isPending} disabled={!resolvedName}>
            Save this account
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {error ? <FormAlert tone="error">{error}</FormAlert> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="bank" label="Bank">
              {(p) => (
                <Select
                  name="bank"
                  required
                  value={bankCode}
                  disabled={banks.isPending}
                  onChange={(e) => {
                    setBankCode(e.target.value)
                    lookUp(e.target.value, accountNumber)
                  }}
                  {...p}
                >
                  <option value="">
                    {banks.isPending ? 'Loading banks…' : 'Choose your bank'}
                  </option>
                  {banks.data?.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="accountNumber" label="Account number" helper="10 digits (NUBAN).">
              {(p) => (
                <Input
                  name="accountNumber"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  required
                  value={accountNumber}
                  className="tabular-nums"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setAccountNumber(v)
                    lookUp(bankCode, v)
                  }}
                  {...p}
                />
              )}
            </Field>
          </div>
          {banks.isError ? (
            <FormAlert tone="error">{apiErrorMessage(banks.error)}</FormAlert>
          ) : null}
          <output aria-live="polite" className="min-h-6 text-body text-ink">
            {resolve.isPending ? (
              <span className="text-ink-2">Looking up the account name…</span>
            ) : resolvedName ? (
              <>
                Account name: <span className="font-semibold">{resolvedName}</span>
              </>
            ) : null}
          </output>
        </div>
      </SettingsPanel>
    </form>
  )
}
