import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { CatalogLayout } from '@/components/catalog/catalog-layout'
import { CourseResults } from '@/components/catalog/course-results'
import { CoursesHeader } from '@/components/catalog/courses-header'
import { GridSkeleton } from '@/components/catalog/grid-skeleton'
import type { RawParams } from '@/lib/catalog-params'

export const metadata: Metadata = {
  title: 'All courses',
  robots: { index: false, follow: true },
  alternates: { canonical: '/courses' },
}

// `/courses?…` with filters, sort or a page cursor (proxy.ts rewrites it here; the address bar
// keeps /courses). Reads the query, so it renders per request. A `q` goes to /search.
export default function FilteredCoursesPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>
}) {
  return (
    <>
      <CoursesHeader />
      <Suspense
        fallback={
          <CatalogLayout filters={null}>
            <GridSkeleton />
          </CatalogLayout>
        }
      >
        <Filtered searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Filtered({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q.trim() : ''
  if (q) redirect(`/search?q=${encodeURIComponent(q)}`)
  return <CourseResults params={params} />
}
