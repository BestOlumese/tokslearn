'use client'
// Client component: changes the password through Better Auth.

import { Button, buttonClasses } from '@tokslearn/ui/button'
import { Checkbox } from '@tokslearn/ui/checkbox'
import { Field } from '@tokslearn/ui/field'
import { Label } from '@tokslearn/ui/label'
import Link from 'next/link'
import { useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { PasswordInput } from '@/components/auth/password-input'
import { authFetch } from '@/lib/auth-client'

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, setPending] = useState(false)

  if (!hasPassword) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-ink-2">
          You sign in with Google or an email code, so your account has no password. To add one, ask
          for a reset link to your email.
        </p>
        <Link
          href="/forgot-password"
          className={buttonClasses({ variant: 'secondary', className: 'self-start' })}
        >
          Set a password
        </Link>
      </div>
    )
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formEl = event.currentTarget
    const form = new FormData(formEl)
    const newPassword = String(form.get('new') ?? '')
    if (newPassword !== String(form.get('confirm') ?? '')) {
      setMessage({ tone: 'error', text: 'The two new passwords don’t match.' })
      return
    }
    setPending(true)
    const res = await authFetch('/change-password', {
      currentPassword: String(form.get('current') ?? ''),
      newPassword,
      revokeOtherSessions: form.get('revoke') === 'on',
    })
    setPending(false)
    if (res.error) {
      setMessage({ tone: 'error', text: res.error.message })
      return
    }
    formEl.reset()
    setMessage({ tone: 'success', text: 'Password changed. We emailed you a notice.' })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {message ? <FormAlert tone={message.tone}>{message.text}</FormAlert> : null}
      <Field id="current" label="Current password">
        {(p) => <PasswordInput name="current" autoComplete="current-password" required {...p} />}
      </Field>
      <Field id="new" label="New password" helper="At least 10 characters.">
        {(p) => (
          <PasswordInput
            name="new"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            {...p}
          />
        )}
      </Field>
      <Field id="confirm-new" label="Type the new password again">
        {(p) => (
          <PasswordInput
            name="confirm"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            {...p}
          />
        )}
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox id="revoke" name="revoke" defaultChecked />
        <Label htmlFor="revoke" kind="option">
          Sign out my other devices
        </Label>
      </div>
      <Button type="submit" loading={pending} className="self-start">
        Change password
      </Button>
    </form>
  )
}
