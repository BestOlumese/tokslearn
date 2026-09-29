import type { Metadata } from 'next'
import { LearnersTable } from '@/components/studio/learners-table'

export const metadata: Metadata = { title: 'Learners' }

// docs/20 §5 `/teach/courses/[id]/learners`.
export default function LearnersPage() {
  return <LearnersTable />
}
