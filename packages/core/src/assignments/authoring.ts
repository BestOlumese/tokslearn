import { AssignmentSettings, type RichTextDoc, rubricMax } from '@tokslearn/contract'
import { schema } from '@tokslearn/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  addLesson,
  renderRichText,
  richTextToPlain,
  type StudioCourse,
  type StudioCourseRef,
  studioCourse,
} from '../courses'
import type { Ctx } from '../kernel/ctx'
import { NotFoundError, ValidationError } from '../kernel/errors'

// Assignment authoring (docs/20 studio curriculum, docs/10 §7). An assignment is a lesson; its
// brief and settings are edited in place, like an article (ADR-035).
// Foreign reads (docs/03 §3): lessons.

const { assignments, submissions, lessons } = schema

export const INSTRUCTIONS_MAX = 20_000

type AssignmentRow = typeof assignments.$inferSelect

/** Settings as stored, read back through the schema. */
export function readAssignmentSettings(a: AssignmentRow): AssignmentSettings {
  return AssignmentSettings.parse({
    submissionTypes: a.submissionTypes,
    maxFiles: a.maxFiles,
    maxFileMb: a.maxFileMb,
    rubric: a.rubric ?? null,
    maxScore: a.maxScore,
    passPct: a.passPct,
    dueMode: a.dueMode === 'cohort_date' ? 'none' : a.dueMode,
    dueDays: a.dueDays,
    latePolicy: a.latePolicy,
    resubmissionsAllowed: a.resubmissionsAllowed,
  })
}

/** The most a submission can score: the rubric's top levels, or the plain maximum. */
export const maxScoreOf = (s: AssignmentSettings) => (s.rubric ? rubricMax(s.rubric) : s.maxScore)

export async function addAssignmentLesson(
  ctx: Ctx,
  input: { courseId: string; version: number; sectionId: string; title: string },
): Promise<StudioCourse> {
  return addLesson(ctx, {
    ...input,
    type: 'assignment',
    attach: async (tx, course) => {
      const [row] = await tx.db
        .insert(assignments)
        .values({ courseId: course.id, submissionTypes: ['text', 'file'] })
        .returning({ id: assignments.id })
      if (!row) throw new Error('assignment not inserted')
      return { assignmentId: row.id }
    },
  })
}

export interface StudioAssignment {
  id: string
  courseId: string
  lessonId: string | null
  lessonTitle: string | null
  isLive: boolean
  instructionsDoc: RichTextDoc | null
  settings: AssignmentSettings
  maxScore: number
  /** Submitted and not yet graded. */
  waiting: number
  canEdit: boolean
}

async function assignmentFor(ctx: Ctx, assignmentId: string, need: 'view' | 'edit') {
  const [a] = await ctx.db.select().from(assignments).where(eq(assignments.id, assignmentId))
  if (!a) throw new NotFoundError('ASSIGNMENT_NOT_FOUND')
  try {
    return { assignment: a, course: await studioCourse(ctx, a.courseId, need) }
  } catch (e) {
    if (e instanceof NotFoundError) throw new NotFoundError('ASSIGNMENT_NOT_FOUND')
    throw e
  }
}

async function studioView(
  ctx: Ctx,
  a: AssignmentRow,
  course: StudioCourseRef,
): Promise<StudioAssignment> {
  const [[lesson], [count]] = await Promise.all([
    ctx.db
      .select({ id: lessons.id, title: lessons.title, liveSince: lessons.liveSince })
      .from(lessons)
      .where(and(eq(lessons.assignmentId, a.id), isNull(lessons.deletedAt))),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(submissions)
      .where(
        and(
          eq(submissions.assignmentId, a.id),
          sql`${submissions.status} in ('submitted', 'grading')`,
        ),
      ),
  ])
  const settings = readAssignmentSettings(a)
  return {
    id: a.id,
    courseId: a.courseId,
    lessonId: lesson?.id ?? null,
    lessonTitle: lesson?.title ?? null,
    isLive: lesson?.liveSince != null,
    instructionsDoc: (a.instructionsDoc as RichTextDoc | null) ?? null,
    settings,
    maxScore: maxScoreOf(settings),
    waiting: count?.n ?? 0,
    canEdit: course.canEdit,
  }
}

export async function getStudioAssignment(
  ctx: Ctx,
  assignmentId: string,
): Promise<StudioAssignment> {
  const { assignment, course } = await assignmentFor(ctx, assignmentId, 'view')
  return studioView(ctx, assignment, course)
}

export async function updateAssignment(
  ctx: Ctx,
  input: { assignmentId: string; instructions: RichTextDoc | null; settings: unknown },
): Promise<StudioAssignment> {
  const { assignment, course } = await assignmentFor(ctx, input.assignmentId, 'edit')
  const parsed = AssignmentSettings.safeParse(input.settings)
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({
        path: ['settings', ...i.path.map(String)].join('.'),
        message: i.message,
      })),
    )
  }
  const s = parsed.data
  if (s.dueMode === 'days_after_enrollment' && !s.dueDays) {
    throw new ValidationError([
      { path: 'settings.dueDays', message: 'How many days after enrolling?' },
    ])
  }
  const text = richTextToPlain(input.instructions)
  if (text.length > INSTRUCTIONS_MAX) {
    throw new ValidationError([{ path: 'instructions', message: 'Up to 20,000 characters.' }])
  }
  const instructions = text ? input.instructions : null
  const [row] = await ctx.db
    .update(assignments)
    .set({
      instructionsDoc: instructions as unknown as Record<string, unknown> | null,
      instructionsHtml: instructions ? renderRichText(instructions) : null,
      submissionTypes: [...new Set(s.submissionTypes)],
      maxFiles: s.maxFiles,
      maxFileMb: s.maxFileMb,
      rubric: s.rubric as unknown as Record<string, unknown> | null,
      maxScore: s.rubric ? rubricMax(s.rubric) : s.maxScore,
      passPct: s.passPct,
      dueMode: s.dueMode,
      dueDays: s.dueMode === 'days_after_enrollment' ? s.dueDays : null,
      latePolicy: s.latePolicy,
      resubmissionsAllowed: s.resubmissionsAllowed,
    })
    .where(eq(assignments.id, assignment.id))
    .returning()
  if (!row) throw new Error('assignment not updated')
  return studioView(ctx, row, course)
}
