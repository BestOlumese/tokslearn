import { describe, expect, it } from 'vitest'
import { googleCalendarUrl, lagosWhen, maxParticipants, phase, scheduleIssues } from './rules'

const at = (iso: string) => new Date(iso)
const s = {
  startsAt: at('2026-10-02T18:00:00Z'),
  endsAt: at('2026-10-02T19:00:00Z'),
  status: 'scheduled' as const,
}

describe('live rules', () => {
  it('opens 15 minutes early for learners and 30 for hosts, and closes at the end', () => {
    expect(phase(s, at('2026-10-02T17:44:00Z'))).toBe('upcoming')
    expect(phase(s, at('2026-10-02T17:45:00Z'))).toBe('open')
    expect(phase(s, at('2026-10-02T17:31:00Z'), true)).toBe('open')
    expect(phase(s, at('2026-10-02T18:59:00Z'))).toBe('open')
    expect(phase(s, at('2026-10-02T19:00:00Z'))).toBe('ended')
    expect(phase({ ...s, status: 'cancelled' }, at('2026-10-02T18:10:00Z'))).toBe('cancelled')
  })

  it('stays open while the meeting overruns, until the room expires', () => {
    const live = { ...s, status: 'live' as const }
    expect(phase(live, at('2026-10-02T19:20:00Z'))).toBe('open')
    expect(phase(live, at('2026-10-02T19:30:00Z'))).toBe('ended')
    expect(phase({ ...s, status: 'ended' as const }, at('2026-10-02T18:50:00Z'))).toBe('ended')
  })

  it('caps rooms at 200 and sizes cohort rooms to the run', () => {
    expect(maxParticipants(null)).toBe(200)
    expect(maxParticipants(20)).toBe(30)
    expect(maxParticipants(500)).toBe(200)
  })

  it('checks title and duration (3 hours at most)', () => {
    expect(scheduleIssues({ title: 'Q&A', startsAt: s.startsAt, durationMin: 60 })).toEqual([])
    expect(
      scheduleIssues({ title: 'x', startsAt: s.startsAt, durationMin: 181 }).map((i) => i.path),
    ).toEqual(['title', 'durationMin'])
  })

  it('writes times in Lagos and builds a calendar link', () => {
    expect(lagosWhen(s.startsAt)).toBe('Friday 2 October at 7:00 pm')
    const url = new URL(
      googleCalendarUrl({ title: 'Week 1', startsAt: s.startsAt, endsAt: s.endsAt, details: 'x' }),
    )
    expect(url.searchParams.get('dates')).toBe('20261002T180000Z/20261002T190000Z')
  })
})
