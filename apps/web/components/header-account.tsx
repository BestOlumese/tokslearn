'use client'
// Client component: public pages are static, so the signed-in state comes from a non-secret hint
// cookie set at sign-in (never used for authorization). The slot keeps a fixed width: no shift.

import { buttonClasses } from '@tokslearn/ui/button'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export function HeaderAccount() {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    setSignedIn(document.cookie.split('; ').some((c) => c === 'tl_signed_in=1'))
  }, [])

  return (
    <div className="flex w-[92px] items-center justify-end gap-2 sm:w-[236px]">
      {signedIn ? (
        <>
          <span className="hidden sm:contents">
            <Link href="/account" className={buttonClasses({ variant: 'tertiary', size: 'sm' })}>
              My learning
            </Link>
          </span>
          <Link
            href="/account/settings/profile"
            className={buttonClasses({ variant: 'secondary', size: 'sm' })}
          >
            Account
          </Link>
        </>
      ) : (
        <>
          <Link href="/sign-in" className={buttonClasses({ variant: 'tertiary', size: 'sm' })}>
            Sign in
          </Link>
          <span className="hidden sm:contents">
            <Link href="/sign-up" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              Create account
            </Link>
          </span>
        </>
      )}
    </div>
  )
}
