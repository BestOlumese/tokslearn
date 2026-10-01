// Live class rules (docs/10 §11, ADR-039). Pure functions; the service does the I/O.

const MIN = 60_000

/** Learners can join from 15 minutes before the start (docs/21 LIVE_NOT_OPEN). */
export const LEARNER_EARLY_MIN = 15
/** Hosts can open the room earlier to set up. */
export const HOST_EARLY_MIN = 30
/** The room (and every token) expires this long after the scheduled end; Daily ejects everyone. */
export const ROOM_GRACE_MIN = 30
export const MIN_DURATION_MIN = 15
/** Cost guard: no session longer than 3 hours. */
export const MAX_DURATION_MIN = 180
/** Cost guard and Daily Prebuilt's limit for an interactive call. */
export const MAX_PARTICIPANTS = 200
export const TITLE_MIN = 3
export const TITLE_MAX = 120

export type LiveStatus = 'scheduled' | 'live' | 'ended' | 'cancelled'
export type Phase = 'upcoming' | 'open' | 'ended' | 'cancelled'

interface Timed {
  startsAt: Date
  endsAt: Date
  status: LiveStatus
}

export const roomName = (sessionId: string) => `tl-${sessionId}`
export const roomExpiry = (s: { endsAt: Date }) =>
  new Date(s.endsAt.getTime() + ROOM_GRACE_MIN * MIN)
export const opensAt = (s: { startsAt: Date }, host = false) =>
  new Date(s.startsAt.getTime() - (host ? HOST_EARLY_MIN : LEARNER_EARLY_MIN) * MIN)

/**
 * Where a session stands for someone. It stays open past the scheduled end while Daily says the
 * meeting is still going, up to the room's expiry.
 */
export function phase(s: Timed, now: Date, host = false): Phase {
  if (s.status === 'cancelled') return 'cancelled'
  if (now < opensAt(s, host)) return 'upcoming'
  if (now < s.endsAt) return s.status === 'ended' ? 'ended' : 'open'
  if (s.status === 'live' && now < roomExpiry(s)) return 'open'
  return 'ended'
}

/** Daily rooms hold everyone in a run plus a few hosts, never more than the cost guard. */
export const maxParticipants = (cohortCapacity: number | null) =>
  cohortCapacity === null ? MAX_PARTICIPANTS : Math.min(MAX_PARTICIPANTS, cohortCapacity + 10)

export interface ScheduleInput {
  title: string
  startsAt: Date
  durationMin: number
}

export function scheduleIssues(input: ScheduleInput): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = []
  const title = input.title.trim()
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    issues.push({ path: 'title', message: `Between ${TITLE_MIN} and ${TITLE_MAX} characters.` })
  }
  if (
    !Number.isInteger(input.durationMin) ||
    input.durationMin < MIN_DURATION_MIN ||
    input.durationMin > MAX_DURATION_MIN
  ) {
    issues.push({
      path: 'durationMin',
      message: `Between ${MIN_DURATION_MIN} minutes and ${MAX_DURATION_MIN / 60} hours.`,
    })
  }
  if (Number.isNaN(input.startsAt.getTime())) {
    issues.push({ path: 'startsAt', message: 'Pick a date and time.' })
  }
  return issues
}

export const endsAtFor = (startsAt: Date, durationMin: number) =>
  new Date(startsAt.getTime() + durationMin * MIN)

/** "Friday 2 October at 7:00 pm" in Lagos time, for emails. */
export const lagosWhen = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)

/** "7:00 pm" in Lagos time. */
export const lagosTime = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)

const icsStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

/** A Google Calendar "add event" link (most of our learners use Gmail on Android). */
export function googleCalendarUrl(input: {
  title: string
  startsAt: Date
  endsAt: Date
  details: string
}): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${icsStamp(input.startsAt)}/${icsStamp(input.endsAt)}`,
    details: input.details,
  })
  return `https://calendar.google.com/calendar/render?${q}`
}
