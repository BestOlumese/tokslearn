import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { HeaderSearch } from '@/components/site/header-search'
import { PageHeader } from '@/components/site/page-header'

export const metadata: Metadata = {
  title: 'Courses',
  description:
    'Browse Tokslearn courses: priced in naira, with refund rules and certificates shown up front.',
  robots: { index: false },
}

// docs/20 §1 `/courses` is built in Phase 3 (filters, grid, cursor pages). Until then: search and
// an honest empty state.
export default function CoursesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <>
      <PageHeader
        title="Courses"
        description="Every course lists its price in naira, its refund window and how its certificate is earned."
        width="catalog"
      >
        <HeaderSearch className="mt-6 max-w-[560px]" />
      </PageHeader>
      <div className="mx-auto max-w-catalog px-4 pt-10 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="h-[200px]" />}>
          <Results searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  )
}

async function Results({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim().slice(0, 100)
  return (
    <EmptyState
      className="max-w-[720px]"
      title={q ? `No courses match “${q}” yet` : 'No courses are published yet'}
      description="Instructors are putting their first courses through review. Create a free account and you'll be ready to enrol the day they open."
      action={
        <div className="flex flex-wrap gap-2">
          <Link href="/sign-up" className={buttonClasses()}>
            Create a free account
          </Link>
          <Link href="/teach" className={buttonClasses({ variant: 'secondary' })}>
            Teach a course
          </Link>
        </div>
      }
    />
  )
}
