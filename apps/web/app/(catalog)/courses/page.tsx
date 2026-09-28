import type { Metadata } from 'next'
import { CourseResults } from '@/components/catalog/course-results'
import { CoursesHeader } from '@/components/catalog/courses-header'

export const metadata: Metadata = {
  title: 'All courses',
  description:
    'Browse Tokslearn courses by price, level, length and language. Every course shows its naira price and refund window up front.',
  alternates: { canonical: '/courses' },
}

// docs/20 §1 `/courses` without filters: fully static, so the first covers are in the HTML and
// the largest paint doesn't wait for streaming. Filtered URLs (`/courses?level=…`) are rewritten
// by proxy.ts to /course-results, which reads the query (ADR-032).
export default function CoursesPage() {
  return (
    <>
      <CoursesHeader />
      <CourseResults params={{}} />
    </>
  )
}
