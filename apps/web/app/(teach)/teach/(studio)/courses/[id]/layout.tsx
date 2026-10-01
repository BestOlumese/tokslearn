import { toStudioCourseDto } from '@tokslearn/api'
import { isFeatureEnabled } from '@tokslearn/core/admin'
import { getStudioCourse } from '@tokslearn/core/courses'
import { isDomainError } from '@tokslearn/core/kernel'
import { buttonClasses } from '@tokslearn/ui/button'
import { EmptyState } from '@tokslearn/ui/empty-state'
import { Skeleton } from '@tokslearn/ui/skeleton'
import Link from 'next/link'
import { type ReactNode, Suspense } from 'react'
import { CourseEditorHeader } from '@/components/studio/course-editor-header'
import { CourseEditorProvider } from '@/components/studio/course-editor-provider'
import { UploadQueue } from '@/components/studio/upload-queue'
import { requireSignedInCtx } from '@/lib/require-user'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Course editor shell: loads the course once; tabs read and write it through the provider.
export default function CourseEditorLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>
  children: ReactNode
}) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Editor params={params}>{children}</Editor>
    </Suspense>
  )
}

async function Editor({
  params,
  children,
}: {
  params: Promise<{ id: string }>
  children: ReactNode
}) {
  const { id } = await params
  const ctx = await requireSignedInCtx(`/teach/courses/${id}/details`)
  let course: Awaited<ReturnType<typeof getStudioCourse>>
  try {
    if (!UUID.test(id)) throw new Error('bad id')
    course = await getStudioCourse(ctx, id)
  } catch (error) {
    if (isDomainError(error) && error.code !== 'COURSE_NOT_FOUND') throw error
    return (
      <EmptyState
        title="We couldn't find that course."
        description="It may belong to someone else, or the link is wrong."
        action={
          <Link href="/teach/courses" className={buttonClasses({ variant: 'secondary' })}>
            Your courses
          </Link>
        }
      />
    )
  }
  return (
    <CourseEditorProvider initial={toStudioCourseDto(course)}>
      <CourseEditorHeader
        cohorts={await isFeatureEnabled(ctx, 'cohorts')}
        community={await isFeatureEnabled(ctx, 'community')}
      />
      <div className="mt-6">{children}</div>
      <UploadQueue />
    </CourseEditorProvider>
  )
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-96 w-full rounded-card" />
    </div>
  )
}
