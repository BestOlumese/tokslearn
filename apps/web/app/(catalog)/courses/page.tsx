import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Courses', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Courses"
      message="No courses are published yet. The first ones appear here after they pass review."
    />
  )
}
