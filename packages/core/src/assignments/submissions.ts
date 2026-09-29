import type { AssignmentSettings, RichTextDoc, Rubric } from '@tokslearn/contract'
import { schema } from '@tokslearn/db'
import { and, arrayContains, desc, eq, inArray, ne } from 'drizzle-orm'
import { track } from '../analytics'
import { renderRichText, richTextToPlain } from '../courses'
import { lessonAccess } from '../enrollments'
import type { Ctx } from '../kernel/ctx'
import { inTransaction } from '../kernel/ctx'
import {
  ForbiddenError,
  NotFoundError,
  RuleViolationError,
  ValidationError,
} from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { lessonLocked } from '../learning'
import { privateFileUrl } from '../media'
import { maxScoreOf, readAssignmentSettings } from './authoring'
import { dueAtFor, lateness, type SubmitBlock, submitBlock } from './rules'

// The learner's side of assignments (docs/20 assignment lesson, docs/10 §7): read the brief,
// keep a draft (autosaved), submit, see grades and feedback, submit again when allowed.
// Foreign reads (docs/03 §3): lessons, enrollments, files (own uploads);
// writes consumption_events (assignment_submitted: evidence only, no refund effect).

const { assignments, submissions, grades, lessons, enrollments, files, consumptionEvents } = schema

export const TEXT_MAX = 20_000
const LINK_MAX = 2000

export interface FileRef {
  id: string
  name: string
  mime: string
  sizeBytes: number
}

export interface GradeView {
  decision: 'graded' | 'returned'
  score: number | null
  maxScore: number | null
  passed: boolean | null
  feedbackHtml: string | null
  /** Rubric: criterion id → chosen level id. */
  rubricScores: Record<string, string> | null
  gradedAt: Date
}

export interface SubmissionView {
  id: string
  attemptNo: number
  status: 'submitted' | 'grading' | 'graded' | 'returned'
  submittedAt: Date | null
  isLate: boolean
  latePenaltyPct: number
  textHtml: string | null
  files: FileRef[]
  link: string | null
  grade: GradeView | null
}

export interface MyAssignment {
  assignmentId: string
  lessonId: string
  instructionsHtml: string | null
  submissionTypes: AssignmentSettings['submissionTypes']
  maxFiles: number
  maxFileMb: number
  rubric: Rubric | null
  maxScore: number
  passPct: number
  latePolicy: AssignmentSettings['latePolicy']
  resubmissionsAllowed: number
  dueAt: Date | null
  draft: {
    textDoc: RichTextDoc | null
    files: FileRef[]
    link: string | null
    savedAt: Date
  } | null
  /** Newest first. */
  submissions: SubmissionView[]
  canSubmit: boolean
  blockedBy: SubmitBlock | 'past_due' | 'teaching' | null
}

async function assignmentForLesson(ctx: Ctx, lessonId: string) {
  const access = await lessonAccess(ctx, lessonId)
  if (access.reason === 'missing' || !access.courseId) throw new NotFoundError('LESSON_NOT_FOUND')
  if (access.reason === 'revoked') throw new ForbiddenError('ENROLLMENT_REVOKED')
  if (access.reason === 'locked' && access.unlocksAt) throw lessonLocked(access.unlocksAt)
  if (!access.allowed || access.reason === 'preview') throw new ForbiddenError('NOT_ENROLLED')
  const [row] = await ctx.db
    .select({ lesson: lessons, assignment: assignments })
    .from(lessons)
    .innerJoin(assignments, eq(assignments.id, lessons.assignmentId))
    .where(and(eq(lessons.id, lessonId), eq(lessons.type, 'assignment')))
  if (!row) throw new NotFoundError('ASSIGNMENT_NOT_FOUND')
  return {
    access,
    lesson: row.lesson,
    assignment: row.assignment,
    settings: readAssignmentSettings(row.assignment),
  }
}

async function enrolledAt(ctx: Ctx, userId: string, courseId: string): Promise<Date | null> {
  const [e] = await ctx.db
    .select({ at: enrollments.createdAt })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId)))
  return e?.at ?? null
}

export async function fileRefs(
  ctx: Ctx,
  ids: ReadonlyArray<string>,
): Promise<Map<string, FileRef>> {
  if (ids.length === 0) return new Map()
  const rows = await ctx.db
    .select({
      id: files.id,
      key: files.key,
      name: files.originalName,
      mime: files.mime,
      sizeBytes: files.sizeBytes,
    })
    .from(files)
    .where(inArray(files.id, [...ids]))
  return new Map(
    rows.map((f) => [
      f.id,
      {
        id: f.id,
        name: f.name ?? f.key.split('/').pop() ?? 'file',
        mime: f.mime,
        sizeBytes: f.sizeBytes,
      },
    ]),
  )
}

type SubmissionRow = typeof submissions.$inferSelect
type GradeRow = typeof grades.$inferSelect

export const toGradeView = (g: GradeRow): GradeView => ({
  decision: g.decision,
  score: g.score,
  maxScore: g.maxScore,
  passed: g.passed,
  feedbackHtml: g.feedbackHtml,
  rubricScores: (g.rubricScores as Record<string, string> | null) ?? null,
  gradedAt: g.gradedAt,
})

export function toSubmissionView(
  s: SubmissionRow,
  fileMap: Map<string, FileRef>,
  grade: GradeRow | undefined,
): SubmissionView {
  return {
    id: s.id,
    attemptNo: s.attemptNo,
    status: s.status === 'draft' ? 'submitted' : s.status,
    submittedAt: s.submittedAt,
    isLate: s.isLate,
    latePenaltyPct: s.latePenaltyPct,
    textHtml: s.textHtml,
    files: s.fileIds.flatMap((id) => {
      const f = fileMap.get(id)
      return f ? [f] : []
    }),
    link: s.link,
    grade: grade ? toGradeView(grade) : null,
  }
}

/** `assignments.get`: the brief, the learner's draft and submissions, and whether they can submit. */
export async function getMyAssignment(ctx: Ctx, lessonId: string): Promise<MyAssignment> {
  const user = requireUser(ctx.actor)
  const { access, lesson, assignment, settings } = await assignmentForLesson(ctx, lessonId)
  const learner = access.reason === 'enrolled'
  const [rows, since] = await Promise.all([
    ctx.db
      .select({ s: submissions, g: grades })
      .from(submissions)
      .leftJoin(grades, eq(grades.submissionId, submissions.id))
      .where(and(eq(submissions.assignmentId, assignment.id), eq(submissions.userId, user.userId)))
      .orderBy(desc(submissions.attemptNo)),
    learner ? enrolledAt(ctx, user.userId, lesson.courseId) : Promise.resolve(null),
  ])
  const fileMap = await fileRefs(
    ctx,
    rows.flatMap((r) => r.s.fileIds),
  )
  const draft = rows.find((r) => r.s.status === 'draft')?.s
  const done = rows.filter((r) => r.s.status !== 'draft')
  const dueAt = since ? dueAtFor(settings, since) : null
  const late = lateness(settings, dueAt, ctx.now)
  const block = submitBlock(
    settings,
    [...done].reverse().map((r) => ({ status: r.s.status as SubmissionView['status'] })),
  )
  const blockedBy = !learner ? 'teaching' : (block ?? (late.rejected ? 'past_due' : null))
  return {
    assignmentId: assignment.id,
    lessonId: lesson.id,
    instructionsHtml: assignment.instructionsHtml,
    submissionTypes: settings.submissionTypes,
    maxFiles: settings.maxFiles,
    maxFileMb: settings.maxFileMb,
    rubric: settings.rubric,
    maxScore: maxScoreOf(settings),
    passPct: settings.passPct,
    latePolicy: settings.latePolicy,
    resubmissionsAllowed: settings.resubmissionsAllowed,
    dueAt,
    draft: draft
      ? {
          textDoc: (draft.textDoc as RichTextDoc | null) ?? null,
          files: draft.fileIds.flatMap((id) => {
            const f = fileMap.get(id)
            return f ? [f] : []
          }),
          link: draft.link,
          savedAt: draft.updatedAt,
        }
      : null,
    submissions: done.map((r) => toSubmissionView(r.s, fileMap, r.g ?? undefined)),
    canSubmit: blockedBy === null,
    blockedBy,
  }
}

export interface DraftInput {
  lessonId: string
  text: RichTextDoc | null
  fileIds: string[]
  link: string | null
}

/** Checks a draft against the assignment's rules; returns what to store. */
async function cleanDraft(
  ctx: Ctx,
  userId: string,
  settings: AssignmentSettings,
  input: DraftInput,
) {
  const allowed = new Set(settings.submissionTypes)
  const text = input.text && richTextToPlain(input.text) ? input.text : null
  if (text && !allowed.has('text'))
    throw new ValidationError([
      { path: 'text', message: 'This assignment takes no written answer.' },
    ])
  if (text && richTextToPlain(text).length > TEXT_MAX) {
    throw new ValidationError([{ path: 'text', message: 'Up to 20,000 characters.' }])
  }
  const fileIds = [...new Set(input.fileIds)]
  if (fileIds.length > 0 && !allowed.has('file')) {
    throw new ValidationError([{ path: 'fileIds', message: 'This assignment takes no files.' }])
  }
  if (fileIds.length > settings.maxFiles) {
    throw new ValidationError([{ path: 'fileIds', message: `Up to ${settings.maxFiles} files.` }])
  }
  if (fileIds.length > 0) {
    const own = await ctx.db
      .select({ id: files.id, sizeBytes: files.sizeBytes })
      .from(files)
      .where(
        and(
          inArray(files.id, fileIds),
          eq(files.ownerId, userId),
          eq(files.purpose, 'assignment_submission'),
          eq(files.status, 'uploaded'),
        ),
      )
    if (own.length !== fileIds.length) throw new NotFoundError('FILE_NOT_FOUND')
    if (own.some((f) => f.sizeBytes > settings.maxFileMb * 1024 * 1024)) {
      throw new ValidationError([
        { path: 'fileIds', message: `Each file up to ${settings.maxFileMb} MB.` },
      ])
    }
  }
  const link = input.link?.trim() || null
  if (link) {
    if (!allowed.has('link'))
      throw new ValidationError([{ path: 'link', message: 'This assignment takes no link.' }])
    let ok = false
    try {
      const u = new URL(link)
      ok = (u.protocol === 'https:' || u.protocol === 'http:') && link.length <= LINK_MAX
    } catch {}
    if (!ok)
      throw new ValidationError([
        { path: 'link', message: 'Paste a full web address (https://…).' },
      ])
  }
  return {
    textDoc: text as unknown as Record<string, unknown> | null,
    textHtml: text ? renderRichText(text) : null,
    fileIds,
    link,
  }
}

async function nextAttemptNo(ctx: Ctx, assignmentId: string, userId: string) {
  const [last] = await ctx.db
    .select({ n: submissions.attemptNo })
    .from(submissions)
    .where(
      and(
        eq(submissions.assignmentId, assignmentId),
        eq(submissions.userId, userId),
        ne(submissions.status, 'draft'),
      ),
    )
    .orderBy(desc(submissions.attemptNo))
    .limit(1)
  return (last?.n ?? 0) + 1
}

/** `assignments.saveDraft`: replaces the learner's draft (autosave). */
export async function saveDraft(ctx: Ctx, input: DraftInput): Promise<{ savedAt: Date }> {
  const user = requireUser(ctx.actor)
  const { access, assignment, settings } = await assignmentForLesson(ctx, input.lessonId)
  if (access.reason !== 'enrolled') throw new ForbiddenError('NOT_ENROLLED')
  const values = await cleanDraft(ctx, user.userId, settings, input)
  const attemptNo = await nextAttemptNo(ctx, assignment.id, user.userId)
  await ctx.db
    .insert(submissions)
    .values({
      ...values,
      assignmentId: assignment.id,
      userId: user.userId,
      attemptNo,
      status: 'draft',
    })
    .onConflictDoUpdate({
      target: [submissions.assignmentId, submissions.userId],
      targetWhere: eq(submissions.status, 'draft'),
      set: { ...values, updatedAt: ctx.now },
    })
  return { savedAt: ctx.now }
}

/**
 * `assignments.submit`: turns the draft into a submission. Checks the late policy and
 * resubmission rules. Submitting with nothing new returns the current state.
 */
export async function submitAssignment(ctx: Ctx, lessonId: string): Promise<MyAssignment> {
  const user = requireUser(ctx.actor)
  const { access, lesson, assignment, settings } = await assignmentForLesson(ctx, lessonId)
  if (access.reason !== 'enrolled') throw new ForbiddenError('NOT_ENROLLED')

  const submitted = await inTransaction(ctx, async (tx) => {
    const mine = await tx.db
      .select()
      .from(submissions)
      .where(and(eq(submissions.assignmentId, assignment.id), eq(submissions.userId, user.userId)))
      .orderBy(submissions.attemptNo)
      .for('update')
    const draft = mine.find((s) => s.status === 'draft')
    if (!draft) return null
    if (!draft.textHtml && draft.fileIds.length === 0 && !draft.link) {
      throw new ValidationError([{ path: 'draft', message: 'Add your work before submitting.' }])
    }
    const history = mine
      .filter((s) => s.status !== 'draft')
      .map((s) => ({ status: s.status as SubmissionView['status'] }))
    const block = submitBlock(settings, history)
    if (block === 'awaiting_grade' || block === 'no_resubmissions')
      throw new RuleViolationError('RESUBMISSION_NOT_ALLOWED')
    const since = await enrolledAt(tx, user.userId, lesson.courseId)
    const late = lateness(settings, since ? dueAtFor(settings, since) : null, tx.now)
    if (late.rejected) throw new RuleViolationError('SUBMISSION_PAST_DUE')
    const [row] = await tx.db
      .update(submissions)
      .set({
        status: 'submitted',
        submittedAt: tx.now,
        isLate: late.late,
        latePenaltyPct: late.penaltyPct,
      })
      .where(eq(submissions.id, draft.id))
      .returning()
    if (!row) throw new Error('submission not updated')
    await tx.db.insert(consumptionEvents).values({
      userId: user.userId,
      courseId: lesson.courseId,
      kind: 'assignment_submitted',
      refId: row.id,
      occurredAt: tx.now,
      ipHash: tx.ipHash,
    })
    await tx.events.emit('assignment.submitted', {
      userId: user.userId,
      courseId: lesson.courseId,
      assignmentId: assignment.id,
      submissionId: row.id,
    })
    return row
  })
  if (submitted) {
    void track(ctx, 'assignment_submitted', {
      assignment_id: assignment.id,
      is_late: submitted.isLate,
      score_pct: 0,
    })
  }
  return getMyAssignment(ctx, lessonId)
}

/** A 5-minute link to one of the learner's own files in their draft or submissions. */
export async function mySubmissionFileUrl(
  ctx: Ctx,
  input: { lessonId: string; fileId: string },
): Promise<{ url: string; filename: string }> {
  const user = requireUser(ctx.actor)
  const { assignment } = await assignmentForLesson(ctx, input.lessonId)
  const [file] = await ctx.db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, input.fileId),
        eq(files.ownerId, user.userId),
        eq(files.purpose, 'assignment_submission'),
      ),
    )
  const [used] = await ctx.db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.assignmentId, assignment.id),
        eq(submissions.userId, user.userId),
        arrayContains(submissions.fileIds, [input.fileId]),
      ),
    )
    .limit(1)
  if (!file || !used) throw new NotFoundError('FILE_NOT_FOUND')
  const filename = file.originalName ?? file.key.split('/').pop() ?? 'file'
  return { url: await privateFileUrl(ctx, file, filename), filename }
}
