'use client'
// Client component: second step of sign-in with an authenticator or backup code.

import { Button } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { Label } from '@tokslearn/ui/label'
import { useState } from 'react'
import { authFetch, readNext } from '@/lib/auth-client'
import { FormAlert } from './form-alert'

export function TwoFactorChallenge() {
  const [mode, setMode] = useState<'totp' | 'backup'>('totp')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const code = String(form.get('code') ?? '').trim()
    const trustDevice = form.get('trust') === 'on'
    setPending(true)
    setError(null)
    const res =
      mode === 'totp'
        ? await authFetch('/two-factor/verify-totp', { code, trustDevice })
        : await authFetch('/two-factor/verify-backup-code', { code, trustDevice })
    if (res.error) {
      setPending(false)
      setError(res.error.message)
      return
    }
    window.location.assign(readNext())
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" key={mode}>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <Field
        id="code"
        label={mode === 'totp' ? 'Code from your authenticator app' : 'Backup code'}
        helper={
          mode === 'totp'
            ? '6 digits. It changes every 30 seconds.'
            : 'One of the codes you saved when you turned on two-factor. Each works once.'
        }
      >
        {(p) => (
          <Input
            name="code"
            autoComplete="one-time-code"
            spellCheck={false}
            autoCapitalize="none"
            required
            {...(mode === 'totp'
              ? { inputMode: 'numeric' as const, pattern: '[0-9]{6}', maxLength: 6 }
              : { maxLength: 20 })}
            className="font-mono tabular-nums"
            {...p}
          />
        )}
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox id="trust" name="trust" />
        <Label htmlFor="trust" kind="option">
          Don't ask again on this device for 30 days
        </Label>
      </div>
      <Button type="submit" loading={pending} className="w-full">
        Continue
      </Button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'totp' ? 'backup' : 'totp')
          setError(null)
        }}
        className="inline-flex min-h-11 items-center self-start text-body-sm text-brand underline-offset-4 hover:underline"
      >
        {mode === 'totp' ? 'Use a backup code instead' : 'Use my authenticator app'}
      </button>
    </form>
  )
}
