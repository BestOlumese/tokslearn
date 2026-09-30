import type { Metadata } from 'next'
import { Suspense } from 'react'
import { UnansweredQuestions } from '@/components/studio/qa/unanswered-questions'

export const metadata: Metadata = { title: 'Q&A' }

// docs/20 `/teach/qa`: unanswered questions across the courses you teach.
export default function TeachQaPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 text-ink">Questions to answer</h1>
        <p className="mt-1 text-body text-ink-2">
          From learners in the courses you teach. Your answer is marked as the instructor’s, and the
          learner gets an email.
        </p>
      </div>
      <Suspense fallback={null}>
        <UnansweredQuestions />
      </Suspense>
    </div>
  )
}
