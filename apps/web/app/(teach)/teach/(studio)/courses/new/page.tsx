import { listCategoryTree } from '@tokslearn/core/catalog'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NewCourseForm } from '@/components/studio/new-course-form'
import { NotInstructor } from '@/components/studio/not-instructor'
import { studioCtx } from '@/lib/require-instructor'

export const metadata: Metadata = { title: 'New course' }

// docs/20 §5 `/teach/courses/new`: title + category → draft → editor.
export default function NewCoursePage() {
  return (
    <div className="max-w-[640px]">
      <h1 className="text-h1-sm text-ink">New course</h1>
      <p className="mt-1 text-body text-ink-2">
        A working title is enough. Nothing is public until a reviewer approves the course.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-card" />}>
          <Form />
        </Suspense>
      </div>
    </div>
  )
}

async function Form() {
  const { ctx, isInstructor } = await studioCtx('/teach/courses/new')
  if (!isInstructor) return <NotInstructor />
  return <NewCourseForm categories={await listCategoryTree(ctx)} />
}
