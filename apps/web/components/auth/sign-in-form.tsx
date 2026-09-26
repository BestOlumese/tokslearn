'use client'
// Client component: password sign-in with 2FA hand-off and lockout messages.

import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { useEffect, useState } from 'react'
import { authFetch, readNext } from '@/lib/auth-client'
import { FormAlert } from './form-alert'
import { PasswordInput } from './password-input'

export function SignInForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'google') {
      setError('Google sign-in didn’t finish. Try again, or use your email.')
    }
  }, [])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    const res = await authFetch<{ twoFactorRedirect?: boolean }>('/sign-in/email', {
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
      rememberMe: true,
    })
    if (res.error) {
      setPending(false)
      setError(res.error.message)
      return
    }
    const next = readNext()
    if (res.data.twoFactorRedirect) {
      window.location.assign(`/two-factor?next=${encodeURIComponent(next)}`)
      return
    }
    window.location.assign(next)
  }

  const codeHref = `/sign-in/code${email ? `?email=${encodeURIComponent(email)}` : ''}`

  return (
    <div>
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
              onChange={(e) => setEmail(e.currentTarget.value.trim())}
              {...p}
            />
          )}
        </Field>
        <Field id="password" label="Password">
          {(p) => <PasswordInput name="password" autoComplete="current-password" required {...p} />}
        </Field>
        <div className="-mt-2 flex flex-wrap justify-between gap-2 text-body-sm">
          <a
            href={codeHref}
            className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline"
          >
            Email me a code instead
          </a>
          <a
            href="/forgot-password"
            className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline"
          >
            Forgot password?
          </a>
        </div>
        <Button type="submit" loading={pending} className="w-full">
          Sign in
        </Button>
      </form>
    </div>
  )
}
