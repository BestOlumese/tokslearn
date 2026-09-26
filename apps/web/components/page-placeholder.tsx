import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Route } from 'next'
import Link from 'next/link'

/**
 * Route shell for pages that later phases fill in. States what is missing and offers one way on.
 */
export function PagePlaceholder({
  title,
  message,
  action = { href: '/', label: 'Go to the home page' },
}: {
  title: string
  message: string
  action?: { href: Route; label: string }
}) {
  return (
    <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 sm:pt-16 lg:px-8">
      <h1 className="text-h1-sm text-ink sm:text-h1">{title}</h1>
      <EmptyState
        className="mt-6 max-w-[640px]"
        title="Not open yet"
        description={message}
        action={
          <Link href={action.href} className={buttonClasses({ variant: 'secondary' })}>
            {action.label}
          </Link>
        }
      />
    </div>
  )
}
