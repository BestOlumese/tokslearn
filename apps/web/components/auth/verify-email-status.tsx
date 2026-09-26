'use client'
// Client component: "check your inbox" with resend, and the landing state from the email link.

import { Button, buttonClasses } from '@tokslearn/ui/button'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { authFetch, safeNext } from '@/lib/auth-client'
import { FormAlert } from './form-alert'

export function VerifyEmailStatus() {
  const params = useSearchParams()
  const email = params.get('email')
  const next = safeNext(params.get('next'))
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, setPending] = useState(false)

  if (params.get('verified')) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">Your email is confirmed. You can now buy courses.</FormAlert>
        <a href={next} className={buttonClasses({ className: 'w-full' })}>
          Continue
        </a>
      </div>
    )
  }

  const resend = async () => {
    setPending(true)
    const res = await authFetch('/send-verification-email', {
      ...(email ? { email } : {}),
      callbackURL: `/verify-email?verified=1&next=${encodeURIComponent(next)}`,
    })
    setPending(false)
    setMessage(
      res.error
        ? {
            tone: 'error',
            text:
              res.error.status === 400
                ? 'Sign in first, then ask for a new link.'
                : res.error.message,
          }
        : { tone: 'success', text: 'We sent a new link. It works for 24 hours.' },
    )
  }

  const expired = params.get('error')
  return (
    <div className="flex flex-col gap-5">
      {expired ? (
        <FormAlert tone="error">
          This link has expired or was already used. Send yourself a new one.
        </FormAlert>
      ) : (
        <p className="text-body text-ink-2">
          We sent a link to{' '}
          {email ? <span className="font-medium text-ink">{email}</span> : 'your email'}. Open it on
          this device to confirm your address. It works for 24 hours.
        </p>
      )}
      {message ? <FormAlert tone={message.tone}>{message.text}</FormAlert> : null}
      <Button variant="secondary" onClick={resend} loading={pending} className="w-full">
        Send a new link
      </Button>
      <a href={next} className={buttonClasses({ variant: 'tertiary', className: 'w-full' })}>
        I'll do this later
      </a>
    </div>
  )
}
