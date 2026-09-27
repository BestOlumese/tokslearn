import type { CourseCardDto } from '@tokslearn/contract'
import type { Route } from 'next'
import Link from 'next/link'
import { CourseCard } from './course-card'

/** A home page row: heading, "See all" link, up to four cards (docs/11 §5). */
export function CourseRow({
  id,
  title,
  href,
  courses,
}: {
  id: string
  title: string
  href: string
  courses: ReadonlyArray<CourseCardDto>
}) {
  if (courses.length === 0) return null
  return (
    <section aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="text-h2 text-ink">
          {title}
        </h2>
        <Link
          href={href as Route}
          className="text-body-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          See all
        </Link>
      </div>
      <ul className="mt-5 grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
        {courses.slice(0, 4).map((c, i) => (
          <li key={c.courseId}>
            <CourseCard course={c} list={id.replace('row-', 'home_')} position={i + 1} />
          </li>
        ))}
      </ul>
    </section>
  )
}
