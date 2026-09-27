import { Avatar } from '@tokslearn/ui/avatar'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
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
import { search } from '@/lib/catalog-data'
import { parseFilters, type RawParams } from '@/lib/catalog-params'

export const metadata: Metadata = {
  title: 'Search courses',
  robots: { index: false, follow: true },
}

// docs/20 §1 `/search?q=`: same grid and filters as /courses, "Results for …", instructor
// matches, a note when only close spellings matched.
export default function SearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <>
      <div className="border-b border-border bg-surface">
        <div className="mx-auto max-w-catalog px-4 py-8 sm:px-6 lg:px-8">
          <HeaderSearch className="max-w-[640px]" />
          <Suspense fallback={<Skeleton className="mt-6 h-9 w-72" />}>
            <Heading searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
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

async function Heading({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { q } = parseFilters(await searchParams)
  return (
    <h1 className="mt-6 text-h1-sm break-words text-ink">
      {q ? <>Results for “{q}”</> : 'Search courses'}
    </h1>
  )
}

async function Results({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams
  const { q, ...filters } = parseFilters(params)
  if (!q) {
    return (
      <CatalogLayout filters={null}>
        <EmptyState
          title="Type what you want to learn"
          description="Search by skill, tool or instructor, e.g. Excel, Python or Figma."
          action={
            <Link href="/courses" className={buttonClasses({ variant: 'secondary' })}>
              Browse all courses
            </Link>
          }
        />
      </CatalogLayout>
    )
  }
  const result = await search(q, { ...filters, sort: params.sort ? filters.sort : undefined })
  return (
    <CatalogLayout filters={<CourseFilters params={params} action="/search" keep={['q']} />}>
      {result.instructors.length > 0 ? (
        <section aria-labelledby="instructor-matches" className="mb-8">
          <h2 id="instructor-matches" className="text-h4 text-ink">
            Instructors
          </h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {result.instructors.map((i) => (
              <li key={i.slug}>
                <Link
                  href={`/instructors/${i.slug}` as Route}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 hover:border-ink-3"
                >
                  <Avatar name={i.name} src={i.avatarUrl} size="sm" />
                  <span>
                    <span className="block text-body-sm font-semibold text-ink">{i.name}</span>
                    {i.headline ? (
                      <span className="block text-body-sm text-ink-3">{i.headline}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <SortLinks path="/search" params={params} relevance />
      {result.typoMatch ? (
        <p className="mt-4 text-body text-ink-2">
          No exact matches for “{q}”. Showing courses with similar names.
        </p>
      ) : null}
      <div className="mt-6">
        {result.items.length === 0 ? (
          <EmptyState
            title={`Nothing found for “${q}”`}
            description="Try a shorter word, check the spelling, or browse by category."
            action={
              <Link href="/categories" className={buttonClasses({ variant: 'secondary' })}>
                Browse categories
              </Link>
            }
          />
        ) : (
          <CourseGrid
            courses={result.items}
            label={`Results for ${q}`}
            list="search"
            offset={Number(params.cursor ?? 0) || 0}
          />
        )}
      </div>
      <Pager path="/search" params={params} nextCursor={result.nextCursor} />
      {params.cursor ? (
        <Track />
      ) : (
        <Track
          event="search_performed"
          props={{
            query_length: q.length,
            results_count: result.items.length,
            filters: Object.keys(params)
              .filter((k) => k !== 'q' && k !== 'sort' && k !== 'cursor')
              .sort()
              .join(','),
          }}
        />
      )}
    </CatalogLayout>
  )
}
