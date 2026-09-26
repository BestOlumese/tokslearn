import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Route } from 'next'
import Link from 'next/link'

/** docs/20 §0 Forbidden state: say so, and offer the action that grants access. */
export function Forbidden({
  message = "You don't have access to this.",
  action = { href: '/sign-in', label: 'Sign in with a staff account' },
}: {
  message?: string
  action?: { href: Route; label: string }
}) {
  return (
    <EmptyState
      title={message}
      description="This area is for Tokslearn staff."
      action={
        <Link href={action.href} className={buttonClasses({ variant: 'secondary' })}>
          {action.label}
        </Link>
      }
    />
  )
}
