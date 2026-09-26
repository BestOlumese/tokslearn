import { buttonClasses } from '@tokslearn/ui/button'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/site/page-header'

export const metadata: Metadata = { title: 'My learning', robots: { index: false } }

// docs/20 §3 `/account` (enrolments and progress arrive in Phases 4–5). Empty state until then.
export default function MyLearningPage() {
  return (
    <>
      <PageHeader title="My learning" width="catalog">
        <nav aria-label="My learning" className="-mb-8 mt-6 flex gap-6 sm:-mb-10">
          <span
            aria-current="page"
            className="border-b-2 border-brand pb-3 text-body-sm font-medium text-ink"
          >
            All courses
          </span>
          <Link
            href="/account/settings/profile"
            className="pb-3 text-body-sm text-ink-2 hover:text-ink"
          >
            Settings
          </Link>
        </nav>
      </PageHeader>
      <div className="mx-auto max-w-catalog px-4 pt-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start gap-4 rounded-dialog border border-border bg-surface p-8 sm:p-10">
          <h2 className="text-h3 text-ink">You haven’t started a course yet</h2>
          <p className="max-w-prose text-body text-ink-2">
            Courses you buy or enrol in appear here, with your progress and where you stopped.
          </p>
          <Link href="/courses" className={buttonClasses()}>
            Browse courses
          </Link>
        </div>
      </div>
    </>
  )
}
