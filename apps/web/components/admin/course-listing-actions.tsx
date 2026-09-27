'use client'
// Client component: feature on the home page, unpublish or restore a course
// (admin.courses.*). Each change asks for a reason that goes to the audit log.

import { useRouter } from 'next/navigation'
import { apiErrorMessage } from '@/lib/api-error'
import { api } from '@/lib/orpc'
import { ReasonDialog } from './reason-dialog'

export function CourseListingActions({
  course,
}: {
  course: { id: string; title: string; status: string; featured: boolean }
}) {
  const router = useRouter()
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      router.refresh()
      return null
    } catch (e) {
      return apiErrorMessage(e)
    }
  }
  const live = course.status === 'published' || course.status === 'unlisted'

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {course.status === 'published' ? (
        <ReasonDialog
          trigger={course.featured ? 'Unfeature' : 'Feature'}
          triggerLabel={`${course.featured ? 'Unfeature' : 'Feature'} ${course.title}`}
          title={course.featured ? 'Remove from the home page?' : 'Feature on the home page?'}
          description={
            course.featured
              ? `${course.title} leaves the "Picked by our reviewers" row.`
              : `${course.title} goes to the front of the "Picked by our reviewers" row.`
          }
          confirmLabel={course.featured ? 'Remove' : 'Feature'}
          onConfirm={(reason) =>
            run(() =>
              api.admin.courses.setFeatured({
                courseId: course.id,
                featured: !course.featured,
                reason,
              }),
            )
          }
        />
      ) : null}
      {live ? (
        <ReasonDialog
          trigger="Unpublish"
          triggerLabel={`Unpublish ${course.title}`}
          title="Unpublish this course?"
          description="It disappears from the catalog and search at once. Learners who already enrolled keep access."
          confirmLabel="Unpublish"
          confirmVariant="danger"
          onConfirm={(reason) =>
            run(() =>
              api.admin.courses.setListing({ courseId: course.id, action: 'unpublish', reason }),
            )
          }
        />
      ) : null}
      {course.status === 'archived' ? (
        <ReasonDialog
          trigger="Restore"
          triggerLabel={`Restore ${course.title}`}
          title="Put this course back on sale?"
          description="It returns to the catalog and search with its last approved content."
          confirmLabel="Restore"
          onConfirm={(reason) =>
            run(() =>
              api.admin.courses.setListing({ courseId: course.id, action: 'restore', reason }),
            )
          }
        />
      ) : null}
    </div>
  )
}
