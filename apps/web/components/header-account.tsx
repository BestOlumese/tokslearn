'use client'
// Client component: public pages are static, so the signed-in state comes from a non-secret hint
// cookie set at sign-in (never used for authorization, ADR-029). Menus are native <details>; this
// file reads the cookie, keeps the bell's unread count fresh (every 60 s while the tab is visible
// and on window focus; the notifications page fires a focus event after marking things read), and
// closes an open menu on outside click or Escape.

import { buttonClasses } from '@tokslearn/ui/button'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BellIcon } from '@/components/icons/bell-icon'
import { UserIcon } from '@/components/icons/user-icon'

const menuItem =
  'flex min-h-11 items-center rounded-control px-3 text-body-sm text-ink hover:bg-surface-sunken'

export function HeaderAccount() {
  'use no memo' // Ships on every public page, at the JS budget: the memo cache would cost bytes.
  const [signedIn, setSignedIn] = useState(false)
  const [unread, setUnread] = useState(0)
  const menu = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (!signedIn) return
    const load = () =>
      !document.hidden &&
      fetch('/api/v1/notifications/unread-count')
        .then((r) => (r.ok ? r.json() : null))
        .then((r: { count: number } | null) => r && setUnread(r.count))
        .catch(() => undefined)
    load()
    const timer = setInterval(load, 60_000)
    addEventListener('focus', load)
    return () => {
      clearInterval(timer)
      removeEventListener('focus', load)
    }
  }, [signedIn])

  useEffect(() => {
    setSignedIn(document.cookie.split('; ').some((c) => c === 'tl_signed_in=1'))
    const close = (e: Event) => {
      const el = menu.current
      if (!el?.open) return
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) {
        el.open = false
      }
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', close)
    }
  }, [])

  if (!signedIn) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/sign-in" className={buttonClasses({ variant: 'tertiary', size: 'sm' })}>
          Sign in
        </Link>
        <span className="hidden sm:contents">
          <Link href="/sign-up" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
            Create account
          </Link>
        </span>
      </div>
    )
  }

  const items: ReadonlyArray<[Route, string]> = [
    ['/account', 'My learning'],
    // Instructors build courses here; everyone else sees how to apply.
    ['/teach/courses', 'Instructor studio'],
    ['/account/settings/profile', 'Profile'],
    ['/account/settings/security', 'Sign-in and security'],
  ]
  const shown = unread > 99 ? '99+' : unread
  return (
    <div className="flex items-center gap-1">
      <span className="hidden sm:contents">
        <Link href="/account" className={buttonClasses({ variant: 'tertiary', size: 'sm' })}>
          My learning
        </Link>
      </span>
      <Link
        href="/account/notifications"
        aria-label={`Notifications${unread ? `, ${shown} unread` : ''}`}
        className="relative flex size-10 items-center justify-center rounded-control text-ink-2 hover:bg-surface-sunken hover:text-ink"
      >
        <BellIcon />
        {unread ? (
          <span className="absolute top-0.5 right-0.5 grid min-w-4.5 place-items-center rounded-full bg-brand px-1 text-caption leading-4.5 font-semibold text-ink-inverse">
            {shown}
          </span>
        ) : null}
      </Link>
      <details ref={menu} className="relative">
        <summary
          aria-label="Your account"
          className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-border-strong bg-surface text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden"
        >
          <UserIcon />
        </summary>
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-card border border-border bg-surface p-1.5 shadow-pop">
          {items.map(([href, label]) => (
            <Link key={href} href={href} className={menuItem}>
              {label}
            </Link>
          ))}
          <div className="my-1 border-t border-border" />
          <Link href="/sign-out" className={menuItem}>
            Sign out
          </Link>
        </div>
      </details>
    </div>
  )
}
