import * as engagement from '@tokslearn/core/engagement'
import { buttonClasses } from '@tokslearn/ui/button'
import { Input } from '@tokslearn/ui/input'
import { Download } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/site/page-header'
import { clock } from '@/lib/learn-api'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'My notes', robots: { index: false } }

type Search = Promise<{ q?: string }>

// docs/20 `/account/notes`: every note, grouped by course and lesson, with search and export.
export default function NotesPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <PageHeader
        title="My notes"
        width="catalog"
        eyebrow={
          <Link href="/account" className="hover:underline">
            My learning
          </Link>
        }
      />
      <div className="mx-auto max-w-catalog px-4 pt-8 pb-16 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="h-48 animate-pulse rounded-card bg-surface-sunken" />}>
          <Notes searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  )
}

async function Notes({ searchParams }: { searchParams: Search }) {
  const q = ((await searchParams).q ?? '').trim().slice(0, 100)
  const ctx = await requireSignedInCtx(
    q ? `/account/notes?q=${encodeURIComponent(q)}` : '/account/notes',
  )
  const notes = await engagement.listNotes(ctx, { q: q || undefined })

  const courses: Array<{
    id: string
    title: string
    slug: string
    lessons: Array<{ id: string; title: string; notes: engagement.NoteView[] }>
  }> = []
  for (const n of notes) {
    let course = courses.find((c) => c.id === n.courseId)
    if (!course) {
      course = { id: n.courseId, title: n.courseTitle, slug: n.courseSlug, lessons: [] }
      courses.push(course)
    }
    let lesson = course.lessons.find((l) => l.id === n.lessonId)
    if (!lesson) {
      lesson = { id: n.lessonId, title: n.lessonTitle, notes: [] }
      course.lessons.push(lesson)
    }
    lesson.notes.push(n)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <search className="w-full max-w-md">
          <form action="/account/notes" className="flex gap-2">
            <label htmlFor="notes-q" className="sr-only">
              Search your notes
            </label>
            <Input
              id="notes-q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search your notes"
            />
            <button type="submit" className={buttonClasses({ variant: 'secondary' })}>
              Search
            </button>
          </form>
        </search>
        <a
          href="/account/notes/export"
          download
          className={buttonClasses({ variant: 'secondary', className: 'self-start' })}
        >
          <Download aria-hidden />
          Export as Markdown
        </a>
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-dialog border border-border bg-surface p-8 sm:p-10">
          <h2 className="text-h3 text-ink">{q ? `No notes match “${q}”` : 'No notes yet'}</h2>
          <p className="max-w-prose text-body text-ink-2">
            {q
              ? 'Try another word, or clear the search to see every note.'
              : 'Notes you write in a lesson land here, with a link back to the exact moment in the video.'}
          </p>
          <Link href={(q ? '/account/notes' : '/account') as Route} className={buttonClasses()}>
            {q ? 'Clear search' : 'Go to My learning'}
          </Link>
        </div>
      ) : (
        courses.map((c) => (
          <section key={c.id} aria-labelledby={`course-${c.id}`} className="flex flex-col gap-4">
            <h2 id={`course-${c.id}`} className="text-h3 text-ink">
              {c.title}
            </h2>
            {c.lessons.map((l) => (
              <div key={l.id} className="rounded-card border border-border bg-surface p-5">
                <h3 className="text-body font-semibold text-ink">
                  <Link
                    href={`/learn/${c.slug}/${l.id}` as Route}
                    className="hover:text-brand-ink hover:underline"
                  >
                    {l.title}
                  </Link>
                </h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {l.notes.map((n) => (
                    <li key={n.id} className="flex gap-3">
                      {n.positionSec !== null ? (
                        <Link
                          href={`/learn/${c.slug}/${l.id}?t=${n.positionSec}` as Route}
                          className="w-14 shrink-0 text-body-sm font-medium text-brand-ink hover:underline"
                          aria-label={`Watch from ${clock(n.positionSec)}`}
                        >
                          {clock(n.positionSec)}
                        </Link>
                      ) : (
                        <span className="w-14 shrink-0 text-body-sm text-ink-3">Note</span>
                      )}
                      <p className="min-w-0 whitespace-pre-wrap text-body text-ink">{n.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  )
}
