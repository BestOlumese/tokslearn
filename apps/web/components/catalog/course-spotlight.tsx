import type { CourseCardDto } from '@tokslearn/contract'
import type { Route } from 'next'
import Link from 'next/link'
import { formatDuration, levelLabel } from '@/lib/format'
import { trackAttr } from '@/lib/track-attr'
import { CourseCover } from './course-cover'
import { Price } from './price'

/**
 * Home hero, right side: one real course, large (docs/11 §5, a concrete promise). A reviewer's
 * pick when there is one, otherwise the newest course. The whole card is one link.
 */
export function CourseSpotlight({ course, label }: { course: CourseCardDto; label: string }) {
  const meta = [
    levelLabel[course.level],
    course.totalDurationSec > 0 ? formatDuration(course.totalDurationSec) : null,
    `${course.lessonCount} ${course.lessonCount === 1 ? 'lesson' : 'lessons'}`,
  ].filter(Boolean)
  return (
    <article className="group relative rounded-dialog border border-border bg-surface p-3">
      <CourseCover
        src={course.coverUrl}
        alt={course.title}
        priority
        sizes="(min-width: 1024px) 520px, 92vw"
      />
      <div className="px-3 pt-4 pb-3">
        <p className="text-body-sm font-medium text-brand-ink">{label}</p>
        <h2 className="mt-1 line-clamp-2 text-h3 text-ink group-hover:text-brand-ink">
          <Link
            href={`/courses/${course.slug}` as Route}
            data-track={trackAttr('course_card_clicked', {
              course_id: course.courseId,
              list: 'home_spotlight',
              position: 1,
            })}
            className="after:absolute after:inset-0 after:rounded-dialog after:content-[''] focus-visible:outline-none"
          >
            {course.title}
          </Link>
        </h2>
        {course.subtitle ? (
          <p className="mt-1.5 line-clamp-2 text-body-sm text-ink-2">{course.subtitle}</p>
        ) : null}
        <p className="mt-3 text-body-sm text-ink-2">
          <span className="font-medium text-ink">{course.instructorName}</span>
          {' · '}
          {meta.join(' · ')}
        </p>
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
          <Price priceKobo={course.priceKobo} compareAtKobo={course.compareAtKobo} />
          <span aria-hidden className="text-body-sm font-medium text-brand group-hover:underline">
            See the course →
          </span>
        </div>
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-dialog ring-focus group-has-[:focus-visible]:ring-2"
      />
    </article>
  )
}
