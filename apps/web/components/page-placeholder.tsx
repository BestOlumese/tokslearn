import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Route } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/site/page-header'

/** Route shell for screens a later phase fills in: says what's missing and offers one way on. */
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
    <>
      <PageHeader title={title} />
      <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 lg:px-8">
        <EmptyState
          className="max-w-[640px]"
          title="Not open yet"
          description={message}
          action={
            <Link href={action.href} className={buttonClasses({ variant: 'secondary' })}>
              {action.label}
            </Link>
          }
        />
      </div>
    </>
  )
}
