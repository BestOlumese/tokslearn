import * as cohorts from '@tokslearn/core/cohorts'
import { isDomainError } from '@tokslearn/core/kernel'
import { buttonClasses } from '@tokslearn/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { formatDate } from '@/lib/format'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Your cohort', robots: { index: false } }

type Params = Promise<{ courseSlug: string }>

// docs/20 `/learn/[courseSlug]/cohort`: the learner's run: dates, the lesson schedule and who
// else is in it. Announcements and the cohort discussion join with community (Phase 8).
export default function CohortPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-page animate-pulse px-4 pt-8" />}>
      <Cohort params={params} />
    </Suspense>
  )
}

const DAY = 86_400_000

function when(startsAt: Date, endsAt: Date, now: Date): string {
  if (now < startsAt) {
    const days = Math.ceil((startsAt.getTime() - now.getTime()) / DAY)
    return days === 1 ? 'Starts tomorrow' : `Starts in ${days} days`
  }
  if (now < endsAt) {
    const week = Math.floor((now.getTime() - startsAt.getTime()) / (7 * DAY)) + 1
    return `Week ${week} of ${Math.ceil((endsAt.getTime() - startsAt.getTime()) / (7 * DAY))}`
  }
  return 'Finished'
}

async function Cohort({ params }: { params: Params }) {
  const { courseSlug } = await params
  const ctx = await requireSignedInCtx(`/learn/${courseSlug}/cohort`)
  let home: cohorts.MyCohort
  try {
    home = await cohorts.getMyCohort(ctx, courseSlug)
  } catch (e) {
    if (isDomainError(e) && e.code === 'COHORT_NOT_FOUND') notFound()
    throw e
  }
  const c = home.cohort
  const base = `/learn/${courseSlug}`
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-8 px-4 py-6 sm:px-6 lg:py-10">
      <Link
        href={base as Route}
        className="inline-flex w-fit items-center gap-1.5 text-body-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {home.course.title}
      </Link>
      <div>
        <p className="text-body-sm font-medium text-brand-ink">
          {when(c.startsAt, c.endsAt, ctx.now)}
        </p>
        <h1 className="mt-1 text-h2 text-ink">{c.name} cohort</h1>
        <p className="mt-1 text-body text-ink-2">
          {formatDate(c.startsAt)} to {formatDate(c.endsAt)} · {home.memberCount}{' '}
          {home.memberCount === 1 ? 'learner' : 'learners'}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="schedule" className="flex flex-col gap-3">
          <h2 id="schedule" className="text-h4 text-ink">
            Schedule
          </h2>
          {home.schedule.length === 0 ? (
            <p className="rounded-card border border-border bg-surface p-5 text-body text-ink-2">
              Every lesson is open from the day you joined. Work through them with your cohort
              between {formatDate(c.startsAt)} and {formatDate(c.endsAt)}.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
              {home.schedule.map((l) => {
                const open = l.opensAt <= ctx.now
                return (
                  <li key={l.lessonId} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-body text-ink">{l.title}</p>
                      <p className="text-body-sm text-ink-2">{l.section}</p>
                    </div>
                    {open ? (
                      <Link
                        href={`${base}/${l.lessonId}` as Route}
                        className={buttonClasses({
                          size: 'sm',
                          variant: 'secondary',
                          className: 'shrink-0',
                        })}
                      >
                        Open
                      </Link>
                    ) : (
                      <p className="shrink-0 text-body-sm text-ink-2">
                        Opens {formatDate(l.opensAt)}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <section aria-labelledby="members" className="flex flex-col gap-3">
          <h2 id="members" className="text-h4 text-ink">
            In this cohort
          </h2>
          <ul className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
            {home.members.map((m) => (
              <li key={m.id} className="text-body-sm text-ink">
                {m.name}
                {m.isMe ? <span className="text-ink-3"> (you)</span> : null}
              </li>
            ))}
          </ul>
          {home.memberCount > home.members.length ? (
            <p className="text-body-sm text-ink-3">
              And {home.memberCount - home.members.length} more.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}
