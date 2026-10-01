'use client'
// Client component: the Join button for a live class (docs/20 live lesson). Disabled with a
// countdown until the room opens, then a link to the class page.

import { buttonClasses } from '@tokslearn/ui/button'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { clockTime, untilText } from '@/lib/live-time'

export function JoinButton({
  href,
  opensAt,
  open,
  host = false,
  size = 'md',
}: {
  href: string
  opensAt: string
  /** The server's view: the room is open now. */
  open: boolean
  host?: boolean
  size?: 'sm' | 'md'
}) {
  const opens = new Date(opensAt).getTime()
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const isOpen = open || (now !== null && now >= opens)
  if (isOpen) {
    return (
      <Link href={href as Route} className={`${buttonClasses({ size })} w-fit`}>
        {host ? 'Start the class' : 'Join the class'}
      </Link>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={buttonClasses({ size, variant: 'secondary' })} aria-disabled="true">
        {host ? 'Start the class' : 'Join the class'}
      </span>
      <span className="text-body-sm text-ink-2">
        Opens at {clockTime(opensAt)}
        {now !== null ? ` (${untilText(opens - now)})` : ''}
      </span>
    </span>
  )
}
