import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import Link from 'next/link'

/** docs/20 §0 Forbidden: the studio is for approved instructors; offer the application. */
export function NotInstructor() {
  return (
    <EmptyState
      title="Apply to teach to use the studio."
      description="Once a reviewer approves your application, you can build and publish courses here."
      action={
        <Link href="/teach/apply" className={buttonClasses()}>
          Apply to teach
        </Link>
      }
    />
  )
}
