import { errorMessage } from '@tokslearn/contract'
import { isDomainError } from '@tokslearn/core/kernel'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import Link from 'next/link'
import { Forbidden } from '@/components/forbidden'

/**
 * Turns the staff guard's errors into page states (docs/07 §4). Anything else is rethrown to the
 * route's error boundary.
 */
export function staffErrorState(error: unknown, path: string) {
  if (!isDomainError(error)) throw error
  switch (error.code) {
    case 'TWO_FACTOR_REQUIRED':
      return (
        <EmptyState
          title={errorMessage('TWO_FACTOR_REQUIRED')}
          description="Staff tools need two-factor authentication on your account."
          action={
            <Link href="/account/settings/security" className={buttonClasses()}>
              Set up two-factor
            </Link>
          }
        />
      )
    case 'STEP_UP_REQUIRED':
      return (
        <EmptyState
          title={errorMessage('STEP_UP_REQUIRED')}
          description="You signed in without your authenticator app. Enter a code to open staff tools."
          action={
            <Link href={`/two-factor?next=${encodeURIComponent(path)}`} className={buttonClasses()}>
              Enter my code
            </Link>
          }
        />
      )
    case 'STAFF_ONLY':
    case 'FORBIDDEN':
    case 'SESSION_EXPIRED':
      return <Forbidden />
    case 'USER_NOT_FOUND':
      return (
        <EmptyState
          title="We couldn't find that user."
          description="They may have been deleted, or the link is wrong."
          action={
            <Link href="/admin/users" className={buttonClasses({ variant: 'secondary' })}>
              Back to users
            </Link>
          }
        />
      )
    default:
      throw error
  }
}
