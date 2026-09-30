import { describe, expect, it } from 'vitest'
import { availability, type CohortFacts, cohortIssues, seatsLeft } from './rules'

const d = (iso: string) => new Date(`${iso}T09:00:00Z`)
const run: CohortFacts = {
  status: 'open',
  startsAt: d('2026-11-03'),
  endsAt: d('2026-12-15'),
  enrollOpensAt: d('2026-10-01'),
  enrollClosesAt: null,
  capacity: 40,
}

describe('cohort availability', () => {
  it('opens in its window and closes at the start by default', () => {
    expect(availability(run, 0, d('2026-09-30'))).toBe('not_open_yet')
    expect(availability(run, 0, d('2026-10-01'))).toBe('open')
    expect(availability(run, 0, d('2026-11-03'))).toBe('closed')
    expect(availability({ ...run, enrollClosesAt: d('2026-11-10') }, 0, d('2026-11-05'))).toBe(
      'open',
    )
  })

  it('is full at capacity, unlimited without one, and never open as a draft or cancelled', () => {
    const now = d('2026-10-15')
    expect(availability(run, 39, now)).toBe('open')
    expect(availability(run, 40, now)).toBe('full')
    expect(availability({ ...run, capacity: null }, 5000, now)).toBe('open')
    expect(availability({ ...run, status: 'draft' }, 0, now)).toBe('draft')
    expect(availability({ ...run, status: 'cancelled' }, 0, now)).toBe('cancelled')
    expect(seatsLeft(run, 38)).toBe(2)
    expect(seatsLeft({ ...run, capacity: null }, 38)).toBeNull()
  })
})

describe('cohort details', () => {
  it('accepts a sensible run and names each problem', () => {
    const ok = { ...run, name: 'November 2026' }
    expect(cohortIssues(ok)).toEqual([])
    const bad = cohortIssues({
      name: 'N',
      startsAt: d('2026-11-03'),
      endsAt: d('2026-11-01'),
      enrollOpensAt: d('2026-11-04'),
      enrollClosesAt: null,
      capacity: 0,
    })
    expect(bad.map((i) => i.path)).toEqual(['name', 'endsAt', 'enrollOpensAt', 'capacity'])
  })
})
