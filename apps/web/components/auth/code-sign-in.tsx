'use client'
// Client component: two-step email code sign-in (send code → enter 6 digits).

import { Button } from '@tokslearn/ui/button'
import { Field } from '@tokslearn/ui/field'
import { Input } from '@tokslearn/ui/input'
import { useEffect, useState } from 'react'
import { authFetch, readNext } from '@/lib/auth-client'
import { FormAlert } from './form-alert'

const RESEND_SEC = 60

export function CodeSignIn() {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('email')
    if (fromQuery) setEmail(fromQuery)
  }, [])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const sendCode = async () => {
    setPending(true)
    setError(null)
    const res = await authFetch('/email-otp/send-verification-otp', { email, type: 'sign-in' })
    setPending(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    setStep('code')
    setWait(RESEND_SEC)
  }

  const verify = async (otp: string) => {
    setPending(true)
    setError(null)
    const res = await authFetch<{ twoFactorRedirect?: boolean }>('/sign-in/email-otp', {
      email,
      otp,
    })
    if (res.error) {
      setPending(false)
      setError(res.error.message)
      return
    }
    window.location.assign(readNext())
  }

  if (step === 'email') {
    return (
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void sendCode()
        }}
      >
        {error ? <FormAlert tone="error">{error}</FormAlert> : null}
        <Field
          id="email"
          label="Email"
          helper="We'll send a 6-digit code that works for 10 minutes."
        >
          {(p) => (
            <Input
              name="email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value.trim())}
              {...p}
            />
          )}
        </Field>
        <Button type="submit" loading={pending} className="w-full">
          Email me a code
        </Button>
      </form>
    )
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        const code = String(new FormData(e.currentTarget).get('code') ?? '')
        void verify(code)
      }}
    >
      <FormAlert tone="success">
        We sent a code to <span className="font-medium">{email}</span>. Check spam if it isn't in
        your inbox.
      </FormAlert>
      {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      <Field id="code" label="6-digit code">
        {(p) => (
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            className="font-mono text-h3 tracking-[0.3em] tabular-nums"
            onChange={(e) => {
              const digits = e.currentTarget.value.replace(/\D/g, '').slice(0, 6)
              e.currentTarget.value = digits
              // Pasting or typing the sixth digit submits: no extra tap on a phone.
              if (digits.length === 6 && !pending) void verify(digits)
            }}
            {...p}
          />
        )}
      </Field>
      <Button type="submit" loading={pending} className="w-full">
        Sign in
      </Button>
      <p className="text-body-sm text-ink-2">
        {wait > 0 ? (
          <span className="tabular-nums">You can ask for a new code in {wait} s.</span>
        ) : (
          <button
            type="button"
            onClick={sendCode}
            className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline"
          >
            Send a new code
          </button>
        )}{' '}
        <button
          type="button"
          onClick={() => {
            setStep('email')
            setError(null)
          }}
          className="inline-flex min-h-11 items-center text-brand underline-offset-4 hover:underline"
        >
          Use a different email
        </button>
      </p>
    </form>
  )
}
