import type { CourseCardDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import type { Route } from 'next'
import Link from 'next/link'
import { formatDayMonth, formatDuration, levelLabel } from '@/lib/format'
import { trackAttr } from '@/lib/track-attr'
import { CourseCover } from './course-cover'
import { Price } from './price'

/** Course card (docs/11 §5): real cover, plain facts, price. The whole card is one link. */
export function CourseCard({
  course,
  list,
  position,
  priority = false,
}: {
  course: CourseCardDto
  /** Where the card is shown, for `course_card_clicked` (home_featured, category, search…). */
  list: string
  position: number
  priority?: boolean
}) {
  const meta = [
    levelLabel[course.level],
    course.totalDurationSec > 0 ? formatDuration(course.totalDurationSec) : null,
    `${course.lessonCount} ${course.lessonCount === 1 ? 'lesson' : 'lessons'}`,
  ].filter(Boolean)
  return (
    <article className="group relative flex flex-col gap-2.5">
      <CourseCover
        src={course.coverUrl}
        alt={course.title}
        priority={priority}
        sizes="(min-width: 1280px) 290px, (min-width: 640px) 45vw, 92vw"
      />
      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-2 text-body font-semibold text-ink group-hover:text-brand-ink">
          <Link
            href={`/courses/${course.slug}` as Route}
            data-track={trackAttr('course_card_clicked', {
              course_id: course.courseId,
              list,
              position,
            })}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {course.title}
          </Link>
        </h3>
        <p className="truncate text-body-sm text-ink-2">{course.instructorName}</p>
        {course.ratingAvg !== null && course.ratingCount >= 3 ? (
          <p className="text-body-sm text-ink-2">
            <span className="font-semibold text-ink">{course.ratingAvg.toFixed(1)}</span> ★ (
            {course.ratingCount})
          </p>
        ) : null}
        <p className="text-body-sm text-ink-3">{meta.join(' · ')}</p>
        <Price priceKobo={course.priceKobo} compareAtKobo={course.compareAtKobo} />
        {course.nextCohortStartsAt ? (
          <Badge tone="accent" className="w-fit">
            Cohort starts {formatDayMonth(course.nextCohortStartsAt)}
          </Badge>
        ) : null}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-1.5 rounded-card ring-focus group-has-[:focus-visible]:ring-2"
      />
    </article>
  )
}
