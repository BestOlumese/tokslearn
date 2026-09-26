'use client'
// Client component: sets a new password from the emailed token.

import { Button, buttonClasses } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { authFetch } from '@/lib/auth-client'
import { FormAlert } from './form-alert'
import { PasswordInput } from './password-input'

export function ResetPasswordForm() {
  const params = useSearchParams()
  const token = params.get('token')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  if (!token || params.get('error')) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="error">
          This reset link has expired or was already used. Ask for a new one.
        </FormAlert>
        <a href="/forgot-password" className={buttonClasses({ className: 'w-full' })}>
          Get a new reset link
        </a>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">
          Your password is changed. For your safety, every device was signed out.
        </FormAlert>
        <a href="/sign-in" className={buttonClasses({ className: 'w-full' })}>
          Sign in with your new password
        </a>
      </div>
    )
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const newPassword = String(form.get('password') ?? '')
    if (newPassword !== String(form.get('confirm') ?? '')) {
      setError('The two passwords don’t match.')
      return
    }
    setPending(true)
    setError(null)
    const res = await authFetch('/reset-password', { newPassword, token })
    setPending(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    setDone(true)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <Field id="password" label="New password" helper="At least 10 characters.">
        {(p) => (
          <PasswordInput
            name="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            {...p}
          />
        )}
      </Field>
      <Field id="confirm" label="Type it again">
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
      <Button type="submit" loading={pending} className="w-full">
        Save new password
      </Button>
    </form>
  )
}
