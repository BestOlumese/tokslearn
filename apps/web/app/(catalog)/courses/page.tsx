import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CatalogLayout } from '@/components/catalog/catalog-layout'
import { CourseFilters } from '@/components/catalog/course-filters'
import { CourseGrid } from '@/components/catalog/course-grid'
import { GridSkeleton } from '@/components/catalog/grid-skeleton'
import { Pager } from '@/components/catalog/pager'
import { SortLinks } from '@/components/catalog/sort-links'
import { Track } from '@/components/catalog/track'
import { HeaderSearch } from '@/components/site/header-search'
import { PageHeader } from '@/components/site/page-header'
import { browse } from '@/lib/catalog-data'
import { parseFilters, type RawParams } from '@/lib/catalog-params'

export const metadata: Metadata = {
  title: 'All courses',
  description:
    'Browse Tokslearn courses by price, level, length and language. Every course shows its naira price and refund window up front.',
  alternates: { canonical: '/courses' },
}

// docs/20 §1 `/courses`: filters in the URL, sort, grid, cursor pages. A `q` goes to /search.
export default function CoursesPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <>
      <PageHeader
        title="All courses"
        description="Prices in naira, refund windows shown before you pay."
        width="catalog"
      >
        <HeaderSearch className="mt-6 max-w-[560px]" />
      </PageHeader>
      <Suspense
        fallback={
          <CatalogLayout filters={null}>
            <GridSkeleton />
          </CatalogLayout>
        }
      >
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Results({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams
  const { q, ...filters } = parseFilters(params)
  if (q) {
    const { redirect } = await import('next/navigation')
    redirect(`/search?q=${encodeURIComponent(q)}`)
  }
  const page = await browse(filters)
  const filtered = Object.keys(params).some((k) => k !== 'sort' && k !== 'cursor')
  return (
    <CatalogLayout filters={<CourseFilters params={params} action="/courses" />}>
      <SortLinks path="/courses" params={params} />
      <div className="mt-6">
        {page.items.length === 0 ? (
          <EmptyState
            title={filtered ? 'No courses match these filters' : 'No courses yet'}
            description={
              filtered
                ? 'Try another level or length, or clear the filters.'
                : 'The first courses are being reviewed. Teaching something? Apply to be one of the first instructors.'
            }
            action={
              <Link
                href={filtered ? '/courses' : '/teach'}
                className={buttonClasses({ variant: 'secondary' })}
              >
                {filtered ? 'Clear filters' : 'Teach on Tokslearn'}
              </Link>
            }
          />
        ) : (
          <CourseGrid courses={page.items} label="Courses" list="all_courses" />
        )}
      </div>
      <Pager path="/courses" params={params} nextCursor={page.nextCursor} />
      <Track />
    </CatalogLayout>
  )
}
