import type { Metadata } from 'next'
import { PagePlaceholder } from '@/components/page-placeholder'

export const metadata: Metadata = { title: 'Lesson', robots: { index: false } }

export default function Page() {
  return (
    <PagePlaceholder
      title="Lesson"
      message="Lessons open once you're enrolled in a published course."
      action={{ href: '/courses', label: 'Browse courses' }}
    />
  )
}
