import { type AssignmentSettings, type Rubric, rubricMax } from '@tokslearn/contract'
import { ValidationError } from '../kernel/errors'

// Pure assignment rules (docs/10 §7): due dates, lateness, resubmissions, rubric scores.

const DAY_MS = 86_400_000
const round2 = (n: number) => Math.round(n * 100) / 100

/** When the work is due for this learner, or null when there is no due date. */
export function dueAtFor(
  settings: Pick<AssignmentSettings, 'dueMode' | 'dueDays'>,
  enrolledAt: Date,
): Date | null {
  if (settings.dueMode === 'days_after_enrollment' && settings.dueDays) {
    return new Date(enrolledAt.getTime() + settings.dueDays * DAY_MS)
  }
  return null
}

export interface Lateness {
  late: boolean
  /** Late and the policy doesn't take late work. */
  rejected: boolean
  penaltyPct: number
}

export function lateness(
  settings: Pick<AssignmentSettings, 'latePolicy'>,
  dueAt: Date | null,
  at: Date,
): Lateness {
  if (!dueAt) return { late: false, rejected: false, penaltyPct: 0 }
  const policy = settings.latePolicy
  const late = at.getTime() > dueAt.getTime() + policy.graceHours * 3_600_000
  return {
    late,
    rejected: late && policy.mode === 'reject',
    penaltyPct: late && policy.mode === 'penalty' ? policy.penaltyPct : 0,
  }
}

export type SubmitBlock = 'awaiting_grade' | 'no_resubmissions'

/**
 * Whether the learner may submit (again). `history` is their earlier submissions, oldest first.
 * Returned work may always be submitted again; graded work only while resubmissions remain.
 */
export function submitBlock(
  settings: Pick<AssignmentSettings, 'resubmissionsAllowed'>,
  history: ReadonlyArray<{ status: 'submitted' | 'grading' | 'graded' | 'returned' }>,
): SubmitBlock | null {
  const last = history[history.length - 1]
  if (!last) return null
  if (last.status === 'submitted' || last.status === 'grading') return 'awaiting_grade'
  if (last.status === 'returned') return null
  const resubmissionsUsed = history.length - 1
  return resubmissionsUsed < settings.resubmissionsAllowed ? null : 'no_resubmissions'
}

/** Rubric score: one level per criterion, all criteria scored. */
export function scoreRubric(
  rubric: Rubric,
  picks: Readonly<Record<string, string>>,
): { score: number; maxScore: number } {
  let score = 0
  for (const c of rubric.criteria) {
    const levelId = picks[c.id]
    const level = c.levels.find((l) => l.id === levelId)
    if (!level) {
      throw new ValidationError([{ path: `rubricScores.${c.id}`, message: `Score “${c.title}”.` }])
    }
    score += level.points
  }
  const extra = Object.keys(picks).filter((id) => !rubric.criteria.some((c) => c.id === id))
  if (extra.length > 0) {
    throw new ValidationError([
      { path: 'rubricScores', message: 'Score only this rubric’s criteria.' },
    ])
  }
  return { score: round2(score), maxScore: round2(rubricMax(rubric)) }
}

/** The score after a late penalty, two decimals. */
export const afterPenalty = (score: number, penaltyPct: number) =>
  round2((score * (100 - penaltyPct)) / 100)

export const passes = (score: number, maxScore: number, passPct: number) =>
  maxScore > 0 && (score * 100) / maxScore >= passPct
