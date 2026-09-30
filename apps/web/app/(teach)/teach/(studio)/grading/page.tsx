import type { Metadata } from 'next'
import { Suspense } from 'react'
import { GradingQueue } from '@/components/grading/grading-queue'

export const metadata: Metadata = { title: 'Grading' }

// docs/20 §5 `/teach/grading`: work to grade across the courses you teach or assist on, and
// flagged exam attempts. Open to TAs, who aren't instructors: the queue only shows their courses.
export default function GradingPage() {
  return (
    <div>
      <h1 className="text-h1-sm text-ink">Grading</h1>
      <p className="mt-1 max-w-prose text-body text-ink-2">
        Submitted assignments, oldest first, from the courses you teach or assist on.
      </p>
      <div className="mt-6">
        <Suspense fallback={null}>
          <GradingQueue />
        </Suspense>
      </div>
    </div>
  )
}
