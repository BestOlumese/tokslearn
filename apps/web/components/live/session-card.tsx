import type { LiveSessionDto } from '@tokslearn/contract'
import { Badge } from '@tokslearn/ui/badge'
import type { Route } from 'next'
import Link from 'next/link'
import { sessionTime } from '@/lib/live-time'
import { JoinButton } from './join-button'

/** A session from the API (strings) or from core on the server (dates). */
export type SessionLike = Omit<LiveSessionDto, 'startsAt' | 'endsAt' | 'opensAt'> & {
  startsAt: Date | string
  endsAt: Date | string
  opensAt: Date | string
}

/** Classes still to come (soonest first), then past ones (latest first). */
export function upcomingFirst<T extends Pick<SessionLike, 'phase' | 'startsAt'>>(list: T[]): T[] {
  const time = (x: T) => new Date(x.startsAt).getTime()
  const ahead = list.filter((x) => x.phase !== 'ended').sort((a, b) => time(a) - time(b))
  const past = list.filter((x) => x.phase === 'ended').sort((a, b) => time(b) - time(a))
  return [...ahead, ...past]
}

/** Where to open a session: its own page (join, then the recording). */
export const sessionHref = (s: Pick<LiveSessionDto, 'id' | 'course'>) =>
  `/learn/${s.course.slug}/live/${s.id}`

/** One live class on a live lesson or the cohort home (docs/20 live lesson). */
export function SessionCard({ session: s }: { session: SessionLike }) {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
      {s.phase !== 'upcoming' || s.cohort ? (
        <p className="flex flex-wrap items-center gap-2">
          {s.phase === 'open' ? <Badge tone="brand">Live now</Badge> : null}
          {s.phase === 'cancelled' ? <Badge tone="neutral">Cancelled</Badge> : null}
          {s.phase === 'ended' ? <Badge tone="neutral">Ended</Badge> : null}
          {s.cohort ? <Badge tone="info">{s.cohort.name} cohort</Badge> : null}
        </p>
      ) : null}
      <h3 className="text-h4 text-ink">
        <Link href={sessionHref(s) as Route} className="hover:text-brand-ink hover:underline">
          {s.title}
        </Link>
      </h3>
      <p className="text-body-sm text-ink-2">
        {sessionTime(s.startsAt, s.endsAt)} (Lagos) · with {s.hostName}
      </p>
      {s.phase === 'upcoming' || s.phase === 'open' ? (
        <JoinButton
          href={sessionHref(s)}
          opensAt={new Date(s.opensAt).toISOString()}
          open={s.phase === 'open'}
          host={s.isHost}
        />
      ) : null}
      {s.phase === 'cancelled' ? (
        <p className="text-body-sm text-ink-2">Your instructor cancelled this class.</p>
      ) : null}
      {s.phase === 'ended' ? (
        <p className="text-body-sm text-ink-2">
          {s.recordingStatus === 'ready' ? (
            <Link href={sessionHref(s) as Route} className="text-brand-ink hover:underline">
              Watch the recording
            </Link>
          ) : (
            recordingNote(s)
          )}
        </p>
      ) : null}
    </article>
  )
}

/** What to say about the recording of a class that has ended (before it's ready). */
export function recordingNote(s: Pick<LiveSessionDto, 'recordingEnabled' | 'recordingStatus'>) {
  if (s.recordingStatus === 'importing') {
    return 'The recording is being prepared. It usually takes under an hour.'
  }
  if (s.recordingStatus === 'failed') return 'The recording couldn’t be saved.'
  return s.recordingEnabled
    ? 'If the class was recorded, the recording appears here within an hour or two.'
    : 'This class wasn’t recorded.'
}
