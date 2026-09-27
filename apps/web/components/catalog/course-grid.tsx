import type { CourseCardDto } from '@tokslearn/contract'
import { CourseCard } from './course-card'

export function CourseGrid({
  courses,
  label,
  list,
  offset = 0,
}: {
  courses: ReadonlyArray<CourseCardDto>
  label: string
  list: string
  /** Cards before this page, so positions stay right on page 2+. */
  offset?: number
}) {
  return (
    <ul
      aria-label={label}
      className="grid gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {courses.map((c, i) => (
        <li key={c.courseId}>
          <CourseCard course={c} list={list} position={offset + i + 1} priority={i < 2} />
        </li>
      ))}
    </ul>
  )
}
