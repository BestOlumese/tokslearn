'use client'

// Client component: turns two-factor on (QR + backup codes + confirm), off, or renews codes.

import { Badge } from '@tokslearn/ui/badge'
import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { ShieldCheck } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { authFetch } from '@/lib/auth-client'

type Step =
  | { kind: 'idle' }
  | { kind: 'password'; action: 'enable' | 'disable' | 'codes' }
  | { kind: 'scan'; totpURI: string; backupCodes: string[] }
  | { kind: 'codes'; backupCodes: string[] }

function BackupCodes({ codes }: { codes: string[] }) {
  const download = () => {
    const blob = new Blob(
      [`Tokslearn backup codes\nEach code works once.\n\n${codes.join('\n')}\n`],
      { type: 'text/plain' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tokslearn-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-2">
        Save these backup codes somewhere safe. If you lose your phone, each code lets you sign in
        once.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-card border border-border bg-surface-sunken p-4 font-mono text-body-sm tabular-nums">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" className="self-start" onClick={download}>
        Download codes
      </Button>
    </div>
  )
}

export function TwoFactorSettings({
  enabled: initial,
  hasPassword,
}: {
  enabled: boolean
  hasPassword: boolean
}) {
  const [enabled, setEnabled] = useState(initial)
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const withPassword = async (password: string, action: 'enable' | 'disable' | 'codes') => {
    setPending(true)
    setError(null)
    if (action === 'enable') {
      const res = await authFetch<{ totpURI: string; backupCodes: string[] }>(
        '/two-factor/enable',
        { password },
      )
      setPending(false)
      if (res.error) return setError(res.error.message)
      setStep({ kind: 'scan', totpURI: res.data.totpURI, backupCodes: res.data.backupCodes })
    } else if (action === 'disable') {
      const res = await authFetch('/two-factor/disable', { password })
      setPending(false)
      if (res.error) return setError(res.error.message)
      setEnabled(false)
      setStep({ kind: 'idle' })
    } else {
      const res = await authFetch<{ backupCodes: string[] }>('/two-factor/generate-backup-codes', {
        password,
      })
      setPending(false)
      if (res.error) return setError(res.error.message)
      setStep({ kind: 'codes', backupCodes: res.data.backupCodes })
    }
  }

  const confirm = async (code: string) => {
    setPending(true)
    setError(null)
    const res = await authFetch('/two-factor/verify-totp', { code })
    setPending(false)
    if (res.error) return setError(res.error.message)
    setEnabled(true)
    setStep({ kind: 'idle' })
  }

  const secret = step.kind === 'scan' ? new URL(step.totpURI).searchParams.get('secret') : null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {enabled ? (
          <Badge tone="brand">
            <ShieldCheck aria-hidden strokeWidth={1.75} /> On
          </Badge>
        ) : (
          <Badge>Off</Badge>
        )}
        <p className="text-body-sm text-ink-2">
          {enabled
            ? 'Your account asks for a code whenever you sign in with your password.'
            : 'Works with Google Authenticator, Microsoft Authenticator, Authy or 1Password.'}
        </p>
      </div>

      {error ? <FormAlert tone="error">{error}</FormAlert> : null}

      {step.kind === 'idle' ? (
        !hasPassword ? (
          <p className="text-body-sm text-ink-3">
            Set a password first; two-factor protects password sign-in.
          </p>
        ) : enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setStep({ kind: 'password', action: 'codes' })}
            >
              Get new backup codes
            </Button>
            <Button
              variant="tertiary"
              onClick={() => setStep({ kind: 'password', action: 'disable' })}
            >
              Turn off two-factor
            </Button>
          </div>
        ) : (
          <Button
            className="self-start"
            onClick={() => setStep({ kind: 'password', action: 'enable' })}
          >
            Turn on two-factor
          </Button>
        )
      ) : null}

      {step.kind === 'password' ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void withPassword(
              String(new FormData(e.currentTarget).get('password') ?? ''),
              step.action,
            )
          }}
        >
          <Field id="tf-password" label="Confirm with your password">
            {(p) => (
              <PasswordInput name="password" autoComplete="current-password" required {...p} />
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              loading={pending}
              variant={step.action === 'disable' ? 'danger' : 'primary'}
            >
              {step.action === 'enable'
                ? 'Continue'
                : step.action === 'disable'
                  ? 'Turn off two-factor'
                  : 'Create new codes'}
            </Button>
            <Button variant="tertiary" onClick={() => setStep({ kind: 'idle' })}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {step.kind === 'scan' ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <p className="text-body text-ink">1. Scan this code with your authenticator app.</p>
            <div className="self-start rounded-card border border-border bg-surface p-3">
              <QRCodeSVG
                value={step.totpURI}
                size={176}
                title="QR code for your authenticator app"
              />
            </div>
            {secret ? (
              <p className="text-body-sm text-ink-2">
                Can't scan? Enter this key instead:{' '}
                <span className="break-all font-mono text-ink" translate="no">
                  {secret}
                </span>
              </p>
            ) : null}
          </div>
          <div>
            <p className="mb-3 text-body text-ink">2. Save your backup codes.</p>
            <BackupCodes codes={step.backupCodes} />
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void confirm(String(new FormData(e.currentTarget).get('code') ?? ''))
            }}
          >
            <Field id="tf-code" label="3. Enter the 6-digit code the app shows">
              {(p) => (
                <Input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  className="font-mono tabular-nums"
                  {...p}
                />
              )}
            </Field>
            <Button type="submit" loading={pending} className="self-start">
              Turn on two-factor
            </Button>
          </form>
        </div>
      ) : null}

      {step.kind === 'codes' ? (
        <div className="flex flex-col gap-4">
          <BackupCodes codes={step.backupCodes} />
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => setStep({ kind: 'idle' })}
          >
            I've saved them
          </Button>
        </div>
      ) : null}
    </div>
  )
}
