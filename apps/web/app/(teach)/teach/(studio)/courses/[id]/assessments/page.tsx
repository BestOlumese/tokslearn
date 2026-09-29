import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AssessmentsTab } from '@/components/studio/assessments/assessments-tab'

export const metadata: Metadata = { title: 'Assessments' }

// docs/20 §5 `/teach/courses/[id]/assessments`: quizzes, exams, assignments and question banks.
export default function AssessmentsPage() {
  return (
    <Suspense fallback={null}>
      <AssessmentsTab />
    </Suspense>
  )
}
