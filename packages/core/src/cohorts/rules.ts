// Pure cohort rules (docs/10 §9): when a run can be joined, and what a valid run looks like.

export type CohortStatus = 'draft' | 'open' | 'cancelled'

export interface CohortFacts {
  status: CohortStatus
  startsAt: Date
  endsAt: Date
  enrollOpensAt: Date | null
  enrollClosesAt: Date | null
  capacity: number | null
}

export type Availability = 'draft' | 'cancelled' | 'not_open_yet' | 'open' | 'full' | 'closed'

/** How long checkout holds a seat for an unpaid order (docs/10 §9). */
export const HOLD_MS = 30 * 60_000
export const MAX_CAPACITY = 10_000

/** When enrolment closes: the set date, or the start of the run. */
export const closesAt = (c: CohortFacts) => c.enrollClosesAt ?? c.startsAt

/** Whether someone can join now, given the seats already taken (members plus live holds). */
export function availability(c: CohortFacts, taken: number, now: Date): Availability {
  if (c.status === 'draft') return 'draft'
  if (c.status === 'cancelled') return 'cancelled'
  if (c.enrollOpensAt && now < c.enrollOpensAt) return 'not_open_yet'
  if (now >= closesAt(c)) return 'closed'
  if (c.capacity !== null && taken >= c.capacity) return 'full'
  return 'open'
}

export const seatsLeft = (c: CohortFacts, taken: number): number | null =>
  c.capacity === null ? null : Math.max(0, c.capacity - taken)

export interface CohortInput {
  name: string
  startsAt: Date
  endsAt: Date
  enrollOpensAt: Date | null
  enrollClosesAt: Date | null
  capacity: number | null
}

/** Problems with a run's details, as field issues for the form (empty when valid). */
export function cohortIssues(c: CohortInput): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = []
  const name = c.name.trim()
  if (name.length < 2 || name.length > 80) {
    issues.push({ path: 'name', message: 'Between 2 and 80 characters.' })
  }
  if (c.endsAt <= c.startsAt) {
    issues.push({ path: 'endsAt', message: 'The run must end after it starts.' })
  }
  const closes = c.enrollClosesAt ?? c.startsAt
  if (c.enrollClosesAt && c.enrollClosesAt > c.endsAt) {
    issues.push({ path: 'enrollClosesAt', message: 'Enrolment must close before the run ends.' })
  }
  if (c.enrollOpensAt && c.enrollOpensAt >= closes) {
    issues.push({ path: 'enrollOpensAt', message: 'Enrolment must open before it closes.' })
  }
  if (
    c.capacity !== null &&
    (!Number.isInteger(c.capacity) || c.capacity < 1 || c.capacity > MAX_CAPACITY)
  ) {
    issues.push({
      path: 'capacity',
      message: `A whole number from 1 to ${MAX_CAPACITY}, or no limit.`,
    })
  }
  return issues
}
