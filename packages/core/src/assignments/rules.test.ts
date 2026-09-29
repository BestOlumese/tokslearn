import { AssignmentSettings, type Rubric } from '@tokslearn/contract'
import { describe, expect, it } from 'vitest'
import { DomainError } from '../kernel/errors'
import { afterPenalty, dueAtFor, lateness, passes, scoreRubric, submitBlock } from './rules'

const settings = (over: Partial<AssignmentSettings> = {}) =>
  AssignmentSettings.parse({ submissionTypes: ['text'], ...over })

describe('due dates and lateness', () => {
  const enrolled = new Date('2026-10-01T09:00:00Z')
  it('counts days from enrollment; no due date means never late', () => {
    expect(dueAtFor(settings(), enrolled)).toBeNull()
    expect(
      dueAtFor(settings({ dueMode: 'days_after_enrollment', dueDays: 7 }), enrolled)?.toISOString(),
    ).toBe('2026-10-08T09:00:00.000Z')
    expect(lateness(settings(), null, new Date('2030-01-01'))).toEqual({
      late: false,
      rejected: false,
      penaltyPct: 0,
    })
  })

  it('applies grace, then the policy', () => {
    const due = new Date('2026-10-08T09:00:00Z')
    const within = new Date('2026-10-08T10:59:00Z')
    const after = new Date('2026-10-08T11:01:00Z')
    const accept = settings({ latePolicy: { mode: 'accept', penaltyPct: 0, graceHours: 2 } })
    expect(lateness(accept, due, within).late).toBe(false)
    expect(lateness(accept, due, after)).toEqual({ late: true, rejected: false, penaltyPct: 0 })
    const penalty = settings({ latePolicy: { mode: 'penalty', penaltyPct: 20, graceHours: 2 } })
    expect(lateness(penalty, due, after)).toEqual({ late: true, rejected: false, penaltyPct: 20 })
    expect(lateness(penalty, due, within).penaltyPct).toBe(0)
    const reject = settings({ latePolicy: { mode: 'reject', penaltyPct: 0, graceHours: 0 } })
    expect(lateness(reject, due, after)).toEqual({ late: true, rejected: true, penaltyPct: 0 })
  })
})

describe('submitBlock', () => {
  it('allows the first submission, waits for grading, and counts resubmissions', () => {
    const none = settings({ resubmissionsAllowed: 0 })
    const one = settings({ resubmissionsAllowed: 1 })
    expect(submitBlock(none, [])).toBeNull()
    expect(submitBlock(one, [{ status: 'submitted' }])).toBe('awaiting_grade')
    expect(submitBlock(none, [{ status: 'graded' }])).toBe('no_resubmissions')
    expect(submitBlock(one, [{ status: 'graded' }])).toBeNull()
    expect(submitBlock(one, [{ status: 'graded' }, { status: 'graded' }])).toBe('no_resubmissions')
    // Work sent back for changes can always come back.
    expect(submitBlock(none, [{ status: 'returned' }])).toBeNull()
  })
})

describe('rubric scoring', () => {
  const rubric: Rubric = {
    criteria: [
      {
        id: 'acc',
        title: 'Accuracy',
        description: '',
        levels: [
          { id: 'no', title: 'Off', description: '', points: 0 },
          { id: 'ok', title: 'Mostly', description: '', points: 5 },
          { id: 'yes', title: 'Exact', description: '', points: 10 },
        ],
      },
      {
        id: 'pres',
        title: 'Presentation',
        description: '',
        levels: [
          { id: 'no', title: 'Messy', description: '', points: 0 },
          { id: 'yes', title: 'Clear', description: '', points: 5 },
        ],
      },
    ],
  }
  it('adds the chosen levels and needs every criterion', () => {
    expect(scoreRubric(rubric, { acc: 'ok', pres: 'yes' })).toEqual({ score: 10, maxScore: 15 })
    const missing = (() => {
      try {
        scoreRubric(rubric, { acc: 'yes' })
      } catch (e) {
        return e instanceof DomainError ? e.code : 'other'
      }
    })()
    expect(missing).toBe('VALIDATION_FAILED')
    expect(() => scoreRubric(rubric, { acc: 'yes', pres: 'yes', extra: 'x' })).toThrow(DomainError)
    expect(() => scoreRubric(rubric, { acc: 'nope', pres: 'yes' })).toThrow(DomainError)
  })

  it('takes late penalties off and compares with the pass mark', () => {
    expect(afterPenalty(15, 20)).toBe(12)
    expect(afterPenalty(7, 33)).toBe(4.69)
    expect(passes(12, 15, 80)).toBe(true)
    expect(passes(11.99, 15, 80)).toBe(false)
    expect(passes(0, 0, 0)).toBe(false)
  })
})
