'use client'
// Client component: ends the session through Better Auth, then leaves the account area.

import { Button } from '@tokslearn/ui/button'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { authFetch } from '@/lib/auth-client'

export function SignOutButton() {
  const [pending, setPending] = useState(false)
  return (
    <Button
      variant="tertiary"
      size="sm"
      loading={pending}
      icon={<LogOut aria-hidden strokeWidth={1.75} />}
      onClick={async () => {
        setPending(true)
        await authFetch('/sign-out', {})
        window.location.assign('/')
      }}
    >
      Sign out
    </Button>
  )
}
