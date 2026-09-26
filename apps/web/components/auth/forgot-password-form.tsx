'use client'
// Client component: requests a reset link. Same reply whether or not the email has an account.

import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { useState } from 'react'
import { authFetch } from '@/lib/auth-client'
import { FormAlert } from './form-alert'

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    setPending(true)
    setError(null)
    const res = await authFetch('/request-password-reset', { email, redirectTo: '/reset-password' })
    setPending(false)
    // Rate limits and network errors are shown; "no such account" never is (docs/20 §2).
    if (res.error && (res.error.status === 429 || res.error.status === 0)) {
      setError(res.error.message)
      return
    }
    setSentTo(email)
  }

  if (sentTo) {
    return (
      <FormAlert tone="success">
        If <span className="font-medium">{sentTo}</span> has a Tokslearn account, a reset link is on
        its way. It works for 1 hour. Check spam if you can't find it.
      </FormAlert>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <Field id="email" label="Email">
        {(p) => (
          <Input
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            autoCapitalize="none"
            required
            {...p}
          />
        )}
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        Email me a reset link
      </Button>
    </form>
  )
}
