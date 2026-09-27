import { buttonClasses } from '@tokslearn/ui/button'
import { Skeleton } from '@tokslearn/ui/skeleton'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Track } from '@/components/catalog/track'
import { RichHtml } from '@/components/rich-html'
import { getCourse, previewLesson } from '@/lib/catalog-data'
import { formatDuration } from '@/lib/format'

type Params = Promise<{ slug: string; lessonId: string }>

const lessonIdPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|promo)$/i

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const result = await getCourse(slug)
  return {
    title: result.kind === 'course' ? `Free preview: ${result.course.title}` : 'Free preview',
    robots: { index: false, follow: true },
  }
}

// docs/20 §1 `/courses/[slug]/preview/[lessonId]`. Rendered per visit: the video link is signed
// for 30 minutes. A lesson that isn't a free preview sends the visitor to the course page.
export default function PreviewPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PreviewSkeleton />}>
      <Preview params={params} />
    </Suspense>
  )
}

function PreviewSkeleton() {
  return (
    <div className="mx-auto max-w-catalog px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-64" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="aspect-video rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  )
}

async function Preview({ params }: { params: Params }) {
  await connection()
  const { slug, lessonId } = await params
  if (!lessonIdPattern.test(lessonId)) notFound()
  const [result, course] = await Promise.all([previewLesson(slug, lessonId), getCourse(slug)])
  if (course.kind === 'redirect') redirect(`/courses/${course.slug}/preview/${lessonId}` as Route)
  if (result.kind === 'locked') redirect(`/courses/${slug}` as Route)
  if (result.kind === 'missing' || course.kind !== 'course') notFound()

  const { preview } = result
  const c = course.course
  const others = c.sections
    .flatMap((s) => s.lessons)
    .filter((l) => l.isPreview && l.id !== preview.lesson.id)
  const courseHref = `/courses/${c.slug}` as Route
  const next = encodeURIComponent(`/courses/${c.slug}`)

  return (
    <div className="mx-auto max-w-catalog px-4 pt-6 pb-16 sm:px-6 lg:px-8">
      <p className="text-body-sm text-ink-2">
        Free preview from{' '}
        <Link href={courseHref} className="font-medium text-brand-ink underline underline-offset-4">
          {c.title}
        </Link>
      </p>
      <h1 className="mt-1 text-h2 text-ink">{preview.lesson.title}</h1>
      <Track
        event="preview_lesson_played"
        props={{ course_id: c.id, lesson_id: preview.lesson.id }}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {preview.embedUrl ? (
            <div className="aspect-video overflow-hidden rounded-card bg-ink">
              <iframe
                src={preview.embedUrl}
                title={preview.lesson.title}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                className="size-full border-0"
              />
            </div>
          ) : null}
          {preview.articleHtml ? (
            <article className="rounded-card border border-border bg-surface p-6 sm:p-8">
              <RichHtml html={preview.articleHtml} className="text-body text-ink" />
            </article>
          ) : null}
          {!preview.embedUrl && !preview.articleHtml ? (
            <p className="rounded-card border border-border bg-surface p-6 text-body text-ink-2">
              This lesson is a download for enrolled learners. The course page lists what's inside.
            </p>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          <div className="rounded-card border border-border bg-surface p-6">
            <h2 className="text-h4 text-ink">Keep going with this course</h2>
            <p className="mt-2 text-body-sm text-ink-2">
              {c.lessonCount} lessons, {formatDuration(c.totalDurationSec)} in total. Create a free
              account to save your place and see your progress.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Link
                href={`/sign-up?next=${next}` as Route}
                className={buttonClasses({ className: 'w-full' })}
              >
                Create a free account
              </Link>
              <Link
                href={courseHref}
                className={buttonClasses({ variant: 'secondary', className: 'w-full' })}
              >
                Back to the course page
              </Link>
            </div>
          </div>

          {others.length > 0 ? (
            <nav
              aria-labelledby="more-previews"
              className="rounded-card border border-border bg-surface p-6"
            >
              <h2 id="more-previews" className="text-h4 text-ink">
                Other free lessons
              </h2>
              <ul className="mt-3 flex flex-col">
                {others.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/courses/${c.slug}/preview/${l.id}` as Route}
                      className="flex min-h-11 items-center justify-between gap-3 text-body-sm text-ink hover:text-brand-ink hover:underline"
                    >
                      <span className="min-w-0 truncate">{l.title}</span>
                      {l.durationSec ? (
                        <span className="shrink-0 text-ink-3">{formatDuration(l.durationSec)}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
