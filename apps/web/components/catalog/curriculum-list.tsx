import type { PublicCourseDto } from '@tokslearn/contract'
import type { Route } from 'next'
import Link from 'next/link'
import { formatDuration } from '@/lib/format'

const typeLabel = {
  video: 'Video',
  article: 'Article',
  resource: 'Files',
  quiz: 'Quiz',
  assignment: 'Assignment',
  live: 'Live class',
}

/** Curriculum with native <details> sections (no JS); free previews link to the preview page. */
export function CurriculumList({ course }: { course: PublicCourseDto }) {
  const lessons = course.sections.reduce((n, s) => n + s.lessons.length, 0)
  return (
    <section aria-labelledby="curriculum-title">
      <h2 id="curriculum-title" className="text-h2 text-ink">
        Course content
      </h2>
      <p className="mt-2 text-body-sm text-ink-2">
        {course.sections.length} {course.sections.length === 1 ? 'section' : 'sections'} · {lessons}{' '}
        {lessons === 1 ? 'lesson' : 'lessons'}
        {course.totalDurationSec > 0
          ? ` · ${formatDuration(course.totalDurationSec)} in total`
          : ''}
      </p>
      <div className="mt-4 overflow-hidden rounded-card border border-border">
        {course.sections.map((s, i) => (
          <details
            key={s.id}
            open={i === 0}
            className="group border-b border-border bg-surface last:border-0"
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 bg-surface-sunken px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-3">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-4 shrink-0 text-ink-2 transition-transform group-open:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span className="text-body font-semibold text-ink">{s.title}</span>
              </span>
              <span className="shrink-0 text-body-sm text-ink-2">
                {s.lessons.length} {s.lessons.length === 1 ? 'lesson' : 'lessons'}
                {s.durationSec > 0 ? ` · ${formatDuration(s.durationSec)}` : ''}
              </span>
            </summary>
            <ul className="divide-y divide-border">
              {s.lessons.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-body-sm">
                  <span className="w-16 shrink-0 text-ink-3">{typeLabel[l.type]}</span>
                  <span className="min-w-0 flex-1 text-ink">{l.title}</span>
                  {l.isPreview ? (
                    <Link
                      href={`/courses/${course.slug}/preview/${l.id}` as Route}
                      className="shrink-0 font-medium text-brand-ink underline underline-offset-4"
                    >
                      Preview<span className="sr-only"> {l.title}</span>
                    </Link>
                  ) : null}
                  {l.durationSec > 0 ? (
                    <span className="w-14 shrink-0 text-right text-ink-3 tabular-nums">
                      {formatDuration(l.durationSec)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  )
}
