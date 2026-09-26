'use client'
// Client component: submits sign-up to Better Auth and moves to "check your inbox".

import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { useState } from 'react'
import { authFetch, readNext } from '@/lib/auth-client'
import { FormAlert } from './form-alert'
import { PasswordInput } from './password-input'

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null)
  const [emailTaken, setEmailTaken] = useState(false)
  const [pending, setPending] = useState(false)
  const [passwordLength, setPasswordLength] = useState(0)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    setPending(true)
    setError(null)
    setEmailTaken(false)
    const res = await authFetch('/sign-up/email', {
      name: String(form.get('name') ?? '').trim(),
      email,
      password: String(form.get('password') ?? ''),
      callbackURL: `/verify-email?verified=1&next=${encodeURIComponent(readNext())}`,
    })
    if (res.error) {
      setPending(false)
      setEmailTaken(res.error.code.startsWith('USER_ALREADY_EXISTS'))
      setError(res.error.message)
      return
    }
    window.location.assign(
      `/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(readNext())}`,
    )
  }

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate={false}>
        {error ? (
          <FormAlert tone="error">
            {error}{' '}
            {emailTaken ? (
              <a href="/sign-in" className="font-medium underline underline-offset-4">
                Sign in
              </a>
            ) : null}
          </FormAlert>
        ) : null}
        <Field
          id="name"
          label="Full name"
          helper="Shown on your certificates. You can change it later."
        >
          {(p) => <Input name="name" autoComplete="name" required maxLength={80} {...p} />}
        </Field>
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
        <Field
          id="password"
          label="Password"
          helper={
            passwordLength === 0
              ? 'At least 10 characters. A few unrelated words make a strong password.'
              : passwordLength < 10
                ? `${10 - passwordLength} more character${10 - passwordLength === 1 ? '' : 's'} needed.`
                : passwordLength < 14
                  ? 'Long enough. Longer is stronger.'
                  : 'Strong length.'
          }
        >
          {(p) => (
            <PasswordInput
              name="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              onChange={(e) => setPasswordLength(e.currentTarget.value.length)}
              {...p}
            />
          )}
        </Field>
        <p className="text-body-sm text-ink-2">
          By creating an account you agree to our{' '}
          <a href="/terms" className="text-brand underline underline-offset-4">
            terms
          </a>{' '}
          and{' '}
          <a href="/privacy" className="text-brand underline underline-offset-4">
            privacy policy
          </a>
          .
        </p>
        <Button type="submit" loading={pending} className="w-full">
          Create account
        </Button>
      </form>
    </div>
  )
}
