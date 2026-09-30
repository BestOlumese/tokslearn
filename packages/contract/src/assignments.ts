import { z } from 'zod'

// Assignment settings, rubrics and late policies (docs/05 assignments, docs/10 §7). Shared by
// core (validation), the studio, the player and the mobile app.

export const SubmissionType = z.enum(['text', 'file', 'link'])
export type SubmissionType = z.infer<typeof SubmissionType>

const Id = z.string().regex(/^[a-z0-9]{1,16}$/, 'Ids are short lowercase codes.')

export const RubricLevel = z.object({
  id: Id,
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  points: z.number().min(0).max(100),
})

export const RubricCriterion = z.object({
  id: Id,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(''),
  levels: z
    .array(RubricLevel)
    .min(2)
    .max(6)
    .refine((l) => new Set(l.map((x) => x.id)).size === l.length, {
      message: 'Each level needs its own id.',
    }),
})

/** Criteria × levels. The score is the sum of the chosen level per criterion. */
export const Rubric = z.object({
  criteria: z
    .array(RubricCriterion)
    .min(1)
    .max(10)
    .refine((c) => new Set(c.map((x) => x.id)).size === c.length, {
      message: 'Each criterion needs its own id.',
    }),
})
export type Rubric = z.infer<typeof Rubric>

/** Highest possible rubric score. */
export const rubricMax = (rubric: Rubric): number =>
  rubric.criteria.reduce((sum, c) => sum + Math.max(...c.levels.map((l) => l.points)), 0)

export const LatePolicy = z.object({
  /** accept: late is fine; penalty: take `penaltyPct` off the score; reject: no late work. */
  mode: z.enum(['accept', 'penalty', 'reject']).default('accept'),
  penaltyPct: z.number().int().min(0).max(100).default(0),
  /** Hours after the due time that still count as on time. */
  graceHours: z.number().int().min(0).max(168).default(0),
})
export type LatePolicy = z.infer<typeof LatePolicy>

export const AssignmentSettings = z.object({
  submissionTypes: z.array(SubmissionType).min(1).max(3),
  maxFiles: z.number().int().min(1).max(10).default(3),
  maxFileMb: z.number().int().min(1).max(100).default(20),
  rubric: Rubric.nullable().default(null),
  /** Used when there is no rubric. */
  maxScore: z.number().int().min(1).max(1000).default(100),
  passPct: z.number().int().min(0).max(100).default(50),
  /** cohort_date: `dueDays` after the learner's cohort starts (after enrolment without one). */
  dueMode: z.enum(['none', 'days_after_enrollment', 'cohort_date']).default('none'),
  dueDays: z.number().int().min(1).max(365).nullable().default(null),
  latePolicy: LatePolicy.default({ mode: 'accept', penaltyPct: 0, graceHours: 0 }),
  resubmissionsAllowed: z.number().int().min(0).max(10).default(0),
})
export type AssignmentSettings = z.infer<typeof AssignmentSettings>
