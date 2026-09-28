import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import Link from 'next/link'
import { browse } from '@/lib/catalog-data'
import { parseFilters, type RawParams } from '@/lib/catalog-params'
import { CatalogLayout } from './catalog-layout'
import { CourseFilters } from './course-filters'
import { CourseGrid } from './course-grid'
import { Pager } from './pager'
import { SortLinks } from './sort-links'
import { Track } from './track'

/** The `/courses` listing for a set of URL filters (docs/20 §1). Data comes from the cache. */
export async function CourseResults({ params }: { params: RawParams }) {
  const { q: _q, ...filters } = parseFilters(params)
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
