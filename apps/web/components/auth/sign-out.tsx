'use client'
// Client component: ends the session through Better Auth, then returns to the home page.

import { useEffect } from 'react'
import { authFetch } from '@/lib/auth-client'
import { AuthShell } from './auth-shell'

export function SignOut() {
  useEffect(() => {
    void authFetch('/sign-out', {}).finally(() => window.location.replace('/'))
  }, [])
  return (
    <AuthShell
      title="Signing you out"
      intro="One moment. We're ending your session on this device."
    >
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
      </div>
    </AuthShell>
  )
}
