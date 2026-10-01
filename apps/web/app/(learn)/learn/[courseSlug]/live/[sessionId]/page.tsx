import { isDomainError } from '@tokslearn/core/kernel'
import * as live from '@tokslearn/core/live'
import { Badge } from '@tokslearn/ui/badge'
import { ArrowLeft } from 'lucide-react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { LiveRoom } from '@/components/live/live-room'
import { recordingNote } from '@/components/live/session-card'
import { sessionTime } from '@/lib/live-time'
import { requireSignedInCtx } from '@/lib/require-user'

export const metadata: Metadata = { title: 'Live class', robots: { index: false } }

type Params = Promise<{ courseSlug: string; sessionId: string }>

// docs/20 `/learn/[courseSlug]/live/[sessionId]`: the class's time, the room (Daily Prebuilt,
// loaded only on Join) and, after the class, its recording. Behind the `live_classes` flag.
export default function LivePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-page px-4 pt-8" />}>
      <Live params={params} />
    </Suspense>
  )
}

async function Live({ params }: { params: Params }) {
  const { courseSlug, sessionId } = await params
  const ctx = await requireSignedInCtx(`/learn/${courseSlug}/live/${sessionId}`)
  let s: live.LiveSessionDetail
  try {
    s = await live.getSession(ctx, sessionId)
  } catch (e) {
    if (isDomainError(e)) notFound()
    throw e
  }
  if (s.course.slug !== courseSlug) notFound()
  const back = s.isHost
    ? { href: '/teach/live', label: 'Live classes' }
    : s.lessonId
      ? { href: `/learn/${courseSlug}/${s.lessonId}`, label: s.course.title }
      : s.cohort
        ? { href: `/learn/${courseSlug}/cohort`, label: `${s.cohort.name} cohort` }
        : { href: `/learn/${courseSlug}`, label: s.course.title }

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <Link
        href={back.href as Route}
        className="inline-flex w-fit items-center gap-1.5 text-body-sm text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {back.label}
      </Link>
      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2">
          {s.phase === 'open' ? <Badge tone="brand">Live now</Badge> : null}
          {s.phase === 'cancelled' ? <Badge tone="neutral">Cancelled</Badge> : null}
          {s.phase === 'ended' ? <Badge tone="neutral">Ended</Badge> : null}
          {s.cohort ? <Badge tone="info">{s.cohort.name} cohort</Badge> : null}
        </p>
        <h1 className="text-h2 text-ink">{s.title}</h1>
        <p className="text-body text-ink-2">
          {s.course.title} · {sessionTime(s.startsAt, s.endsAt)} (Lagos) · with {s.hostName}
        </p>
      </div>

      {s.phase === 'upcoming' || s.phase === 'open' ? (
        <LiveRoom
          sessionId={s.id}
          opensAt={s.opensAt.toISOString()}
          open={s.phase === 'open'}
          host={s.isHost}
          backHref={back.href}
        />
      ) : null}
      {s.phase === 'cancelled' ? (
        <p className="rounded-card border border-border bg-surface p-5 text-body text-ink-2">
          This class was cancelled. Your instructor will post a new time in the course.
        </p>
      ) : null}
      {s.phase === 'ended' ? (
        s.recordingEmbedUrl ? (
          <section aria-labelledby="recording" className="flex flex-col gap-3">
            <h2 id="recording" className="text-h4 text-ink">
              Recording
            </h2>
            <div className="aspect-video w-full overflow-hidden rounded-card bg-ink">
              <iframe
                src={s.recordingEmbedUrl}
                title={`Recording: ${s.title}`}
                className="size-full border-0"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </section>
        ) : (
          <p className="rounded-card border border-border bg-surface p-5 text-body text-ink-2">
            This class has ended. {recordingNote(s)}
          </p>
        )
      ) : null}
    </div>
  )
}
