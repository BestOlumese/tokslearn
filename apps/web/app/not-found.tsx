import { buttonClasses } from '@tokslearn/ui/button'
import Link from 'next/link'

// docs/20 §0: not-found shows a search field and links to the catalog. The search field
// arrives with the catalog in Phase 3; until then it links to /courses.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-page px-4 pt-10 sm:px-6 sm:pt-16 lg:px-8">
      <p className="text-body-sm font-medium text-ink-3">404</p>
      <h1 className="mt-2 text-h1-sm text-ink sm:text-h1">We couldn't find that page</h1>
      <p className="mt-3 max-w-prose text-body-lg text-ink-2">
        The link may be old, or the page may have moved. Check the address, or start from the course
        list.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/courses" className={buttonClasses()}>
          Browse courses
        </Link>
        <Link href="/" className={buttonClasses({ variant: 'secondary' })}>
          Go to the home page
        </Link>
      </div>
    </div>
  )
}
