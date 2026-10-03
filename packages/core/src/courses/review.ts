import type { RichTextDoc } from '@tokslearn/contract'
import { writeAudit } from '../admin'
import { track } from '../analytics'
import { categoryNames, reindexCourse } from '../catalog'
import { getUserContact } from '../identity'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireStaff, requireUser } from '../kernel/guards'
import { getFiles, getVideoAssets, privateFileUrl, publicFileUrl, videoPreviewUrl } from '../media'
import { notify } from '../notifications'
import * as repo from './repo'
import { richTextToPlain } from './rich-text'
import {
  canEditCourse,
  canReviewCourses,
  type ReviewChecklistKey,
  type RevisionFacts,
  reviewChecklistKeys,
  reviewReasons,
} from './rules'
import { activeOutline, checklistFor, getStudioCourse, type StudioSection } from './service'

// Submit → review → publish (docs/10 §1, docs/25 §B). The snapshot frozen at submit is what the
// reviewer diffs against the live snapshot; approval copies settings to the course row, makes new
// sections/lessons live and removes the ones marked for removal (ADR-030).

export interface Snapshot {
  settings: {
    title: string
    subtitle: string
    description: string
    outcomes: string[]
    requirements: string[]
    categoryId: string | null
    level: string
    language: string
    priceKobo: string
    compareAtKobo: string | null
    refundPolicyDays: number
    certificateMode: string
    /** Which exam or provider counts, in words; '' when the mode has no extra rules. */
    certificateRules?: string
    coverFileId: string | null
  }
  outline: Array<{
    id: string
    title: string
    lessons: Array<{
      id: string
      title: string
      type: string
      isPreview: boolean
      durationSec: number
      videoAssetId: string | null
      resources: number
    }>
  }>
}

/** The certificate rules beyond the mode, in words a reviewer can check. */
function certificateRules(
  revision: repo.RevisionRow,
  sections: ReadonlyArray<StudioSection>,
): string {
  const settings = revision.certificateSettings as {
    examQuizId?: string | null
    requireCompletion?: boolean
    providerName?: string | null
    providerUrl?: string | null
  }
  if (revision.certificateMode === 'exam') {
    const exam = sections.flatMap((s) => s.lessons).find((l) => l.quizId === settings.examQuizId)
    return `Exam: “${exam?.title ?? 'not chosen'}”${settings.requireCompletion ? ' and every lesson' : ''}`
  }
  if (revision.certificateMode === 'external') {
    return `Provider: ${settings.providerName ?? 'not named'}${settings.providerUrl ? ` (${settings.providerUrl})` : ''}`
  }
  return ''
}

function snapshotOf(revision: repo.RevisionRow, sections: ReadonlyArray<StudioSection>): Snapshot {
  return {
    settings: {
      title: revision.title,
      subtitle: revision.subtitle ?? '',
      description: richTextToPlain(revision.descriptionDoc as RichTextDoc | null),
      outcomes: revision.outcomes,
      requirements: revision.requirements,
      categoryId: revision.categoryId,
      level: revision.level,
      language: revision.language,
      priceKobo: revision.priceKobo.toString(),
      compareAtKobo: revision.compareAtKobo?.toString() ?? null,
      refundPolicyDays: revision.refundPolicyDays,
      certificateMode: revision.certificateMode,
      certificateRules: certificateRules(revision, sections),
      coverFileId: revision.coverFileId,
    },
    outline: activeOutline(sections).map((s) => ({
      id: s.id,
      title: s.title,
      lessons: s.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        type: l.type,
        isPreview: l.isPreview,
        durationSec: l.durationSec,
        videoAssetId: l.video?.assetId ?? null,
        resources: l.resources.length,
      })),
    })),
  }
}

const factsOf = (s: Snapshot['settings']): RevisionFacts => ({
  title: s.title,
  subtitle: s.subtitle,
  description: s.description,
  outcomes: s.outcomes,
  requirements: s.requirements,
  categoryId: s.categoryId,
  language: s.language,
  priceKobo: BigInt(s.priceKobo),
  certificateMode: s.certificateMode,
  certificateRules: s.certificateRules ?? '',
  coverFileId: s.coverFileId,
})

/** Outline from the studio view with all rows (including never-live and marked-for-removal). */
async function studioOutline(ctx: Ctx, courseId: string) {
  return (await getStudioCourse(ctx, courseId)).sections
}

/** Makes a revision live. Runs inside the caller's transaction. */
async function applyRevision(
  tx: Ctx,
  course: repo.CourseRow,
  revision: repo.RevisionRow,
  input: {
    reviewerId: string | null
    notes: string | null
    checklist: Record<string, boolean> | null
  },
) {
  if (course.liveRevisionId) {
    await repo.updateRevision(tx.db, course.liveRevisionId, { status: 'superseded' })
  }
  await repo.updateRevision(tx.db, revision.id, {
    status: 'approved',
    reviewedBy: input.reviewerId,
    reviewedAt: tx.now,
    reviewNotes: input.notes,
    reviewChecklist: input.checklist,
  })
  const firstPublish = course.liveRevisionId === null
  await repo.applyStructure(tx.db, course.id, tx.now)
  await repo.updateCourse(tx.db, course.id, {
    liveRevisionId: revision.id,
    draftRevisionId: null,
    status: course.status === 'unlisted' ? 'unlisted' : 'published',
    publishedAt: course.publishedAt ?? tx.now,
    categoryId: revision.categoryId,
    level: revision.level,
    language: revision.language,
    priceKobo: revision.priceKobo,
    compareAtKobo: revision.compareAtKobo,
    refundPolicyDays: revision.refundPolicyDays,
    certificateMode: revision.certificateMode,
    certificateSettings: revision.certificateSettings,
    version: course.version + 1,
  })
  await repo.recomputeTotals(tx.db, course.id)
  // Inline, not a job: the catalog shows the change as soon as the approval commits (ADR-032).
  await reindexCourse(tx, course.id)
  await tx.events.emit(firstPublish ? 'course.published' : 'course.updated', {
    courseId: course.id,
    revisionId: revision.id,
    instructorId: course.instructorId,
  })
  tx.afterCommit(() =>
    tx.cache.invalidate([
      cacheTags.course(course.id),
      cacheTags.courseSlug(course.slug),
      cacheTags.catalog,
      cacheTags.instructor(course.instructorId),
    ]),
  )
  return firstPublish
}

/**
 * Sends the draft for review. Blocks on the publish checklist. For a published course, small
 * changes (docs/10 §1 review rules) are approved at once without a reviewer.
 */
export async function submitForReview(ctx: Ctx, input: { courseId: string; version: number }) {
  const user = requireUser(ctx.actor)
  const sections = await studioOutline(ctx, input.courseId)
  const trusted = (await repo.approvedCourseCount(ctx.db, user.userId)) >= 3

  const outcome = await inTransaction(ctx, async (tx) => {
    const course = await repo.lockCourse(tx.db, input.courseId)
    if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
    if (!canEditCourse(user, course)) {
      if (await repo.isCourseStaff(tx.db, course.id, user.userId)) {
        throw new ForbiddenError('NOT_COURSE_OWNER')
      }
      throw new NotFoundError('COURSE_NOT_FOUND')
    }
    if (course.version !== input.version) throw new ConflictError('VERSION_CONFLICT')
    const revision = course.draftRevisionId
      ? await repo.getRevision(tx.db, course.draftRevisionId)
      : undefined
    if (!revision || revision.status === 'submitted' || revision.status === 'approved') {
      throw new ConflictError('COURSE_NOT_EDITABLE')
    }
    const missing = checklistFor(revision, sections)
      .filter((i) => !i.done)
      .map((i) => i.key)
    if (missing.length > 0)
      throw new RuleViolationError('PUBLISH_CHECKLIST_INCOMPLETE', { missing })

    const snapshot = snapshotOf(revision, sections)
    const live = course.liveRevisionId
      ? await repo.getRevision(tx.db, course.liveRevisionId)
      : undefined
    const liveSnapshot = live?.snapshot as Snapshot | null | undefined
    const reasons = liveSnapshot
      ? reviewReasons({
          live: factsOf(liveSnapshot.settings),
          draft: factsOf(snapshot.settings),
          newSections: sections.filter((s) => !s.isLive && !s.removalRequested).length,
          newLessons: sections
            .filter((s) => s.isLive && !s.removalRequested)
            .flatMap((s) => s.lessons)
            .filter((l) => !l.isLive && !l.removalRequested).length,
          removals:
            sections.filter((s) => s.removalRequested).length +
            sections.flatMap((s) => s.lessons).filter((l) => l.removalRequested).length,
          trustedInstructor: trusted,
        })
      : null

    await repo.updateRevision(tx.db, revision.id, {
      status: 'submitted',
      submittedAt: tx.now,
      snapshot: snapshot as unknown as Record<string, unknown>,
      reviewNotes: null,
    })
    if (reasons && reasons.length === 0) {
      await applyRevision(tx, { ...course, version: course.version }, revision, {
        reviewerId: null,
        notes: 'Approved automatically: small changes.',
        checklist: null,
      })
      return 'auto_approved' as const
    }
    await repo.updateCourse(tx.db, course.id, {
      version: course.version + 1,
      ...(course.liveRevisionId ? {} : { status: 'in_review' as const }),
    })
    await tx.events.emit('course.submitted', { courseId: course.id, revisionId: revision.id })
    return 'submitted' as const
  })

  ctx.afterCommit(() => track(ctx, 'course_submitted', { course_id: input.courseId }))
  return { outcome, studio: await getStudioCourse(ctx, input.courseId) }
}

// ─── Reviewer ──────────────────────────────────────────────────────────────────────────────────

export async function listReviewQueue(ctx: Ctx) {
  requireStaff(ctx.actor, canReviewCourses)
  return repo.submittedRevisions(ctx.db)
}

export type FieldChange = { field: keyof Snapshot['settings']; before: unknown; after: unknown }
export type OutlineChange =
  | { kind: 'section_added' | 'section_removed'; title: string }
  | { kind: 'section_renamed'; before: string; after: string }
  | { kind: 'lesson_added' | 'lesson_removed'; title: string; section: string }
  | { kind: 'lesson_renamed'; before: string; after: string; section: string }
  | { kind: 'video_replaced'; title: string; section: string }

/** What changed between the live snapshot and the submitted one. */
export function diffSnapshots(live: Snapshot | null, next: Snapshot) {
  const fields: FieldChange[] = []
  const outline: OutlineChange[] = []
  if (!live) return { fields, outline, firstVersion: true }
  for (const key of Object.keys(next.settings) as Array<keyof Snapshot['settings']>) {
    // Snapshots from before Phase 7 have no certificate rules: the same as none.
    const before = live.settings[key] ?? (key === 'certificateRules' ? '' : undefined)
    const after = next.settings[key] ?? (key === 'certificateRules' ? '' : undefined)
    if (JSON.stringify(before) !== JSON.stringify(after)) fields.push({ field: key, before, after })
  }
  const liveSections = new Map(live.outline.map((s) => [s.id, s]))
  const nextSections = new Map(next.outline.map((s) => [s.id, s]))
  const liveLessons = new Map(
    live.outline.flatMap((s) => s.lessons.map((l) => [l.id, { ...l, section: s.title }])),
  )
  for (const s of next.outline) {
    const before = liveSections.get(s.id)
    if (!before) outline.push({ kind: 'section_added', title: s.title })
    else if (before.title !== s.title)
      outline.push({ kind: 'section_renamed', before: before.title, after: s.title })
    for (const l of s.lessons) {
      const was = liveLessons.get(l.id)
      if (!was) outline.push({ kind: 'lesson_added', title: l.title, section: s.title })
      else {
        if (was.title !== l.title)
          outline.push({
            kind: 'lesson_renamed',
            before: was.title,
            after: l.title,
            section: s.title,
          })
        if (was.videoAssetId !== l.videoAssetId)
          outline.push({ kind: 'video_replaced', title: l.title, section: s.title })
      }
    }
  }
  const nextLessonIds = new Set(next.outline.flatMap((s) => s.lessons.map((l) => l.id)))
  for (const s of live.outline) {
    if (!nextSections.has(s.id)) outline.push({ kind: 'section_removed', title: s.title })
    for (const l of s.lessons) {
      if (!nextLessonIds.has(l.id) && nextSections.has(s.id)) {
        outline.push({ kind: 'lesson_removed', title: l.title, section: s.title })
      }
    }
  }
  return { fields, outline, firstVersion: false }
}

async function loadSubmitted(ctx: Ctx, revisionId: string) {
  const revision = await repo.getRevision(ctx.db, revisionId)
  if (!revision) throw new NotFoundError('REVISION_NOT_FOUND')
  const course = await repo.getCourse(ctx.db, revision.courseId)
  if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
  return { revision, course }
}

export async function getReview(ctx: Ctx, revisionId: string) {
  requireStaff(ctx.actor, canReviewCourses)
  const { revision, course } = await loadSubmitted(ctx, revisionId)
  const live = course.liveRevisionId
    ? await repo.getRevision(ctx.db, course.liveRevisionId)
    : undefined
  const snapshot = revision.snapshot as Snapshot | null
  if (!snapshot) throw new NotFoundError('REVISION_NOT_FOUND')
  const [instructor, studio, names] = await Promise.all([
    repo.userName(ctx.db, course.instructorId),
    getStudioCourseForReview(ctx, course.id),
    categoryNames(
      ctx,
      [snapshot.settings.categoryId, live?.categoryId ?? null].filter((x): x is string =>
        Boolean(x),
      ),
    ),
  ])
  const cover = revision.coverFileId
    ? (await getFiles(ctx, [revision.coverFileId])).get(revision.coverFileId)
    : undefined
  return {
    revisionId: revision.id,
    courseId: course.id,
    slug: course.slug,
    number: revision.number,
    status: revision.status,
    submittedAt: revision.submittedAt,
    instructorName: instructor?.name ?? '',
    title: revision.title,
    subtitle: revision.subtitle,
    descriptionHtml: revision.descriptionHtml,
    outcomes: revision.outcomes,
    requirements: revision.requirements,
    categoryName: snapshot.settings.categoryId
      ? (names.get(snapshot.settings.categoryId) ?? null)
      : null,
    level: revision.level,
    language: revision.language,
    priceKobo: revision.priceKobo,
    livePriceKobo: live ? course.priceKobo : null,
    refundPolicyDays: revision.refundPolicyDays,
    coverUrl: cover ? publicFileUrl(ctx, cover.key) : null,
    outline: studio,
    diff: diffSnapshots((live?.snapshot as Snapshot | null) ?? null, snapshot),
    checklistKeys: reviewChecklistKeys,
    reviewNotes: revision.reviewNotes,
  }
}

/** The outline the reviewer checks: everything that will be live after approval. */
async function getStudioCourseForReview(ctx: Ctx, courseId: string) {
  // Reviewers aren't course staff, so read the outline directly rather than via the studio guard.
  const [sectionRows, lessonRows] = await Promise.all([
    repo.sectionsOf(ctx.db, courseId),
    repo.lessonsOf(ctx.db, courseId),
  ])
  const resources = await repo.resourcesOf(
    ctx.db,
    lessonRows.map((l) => l.lesson.id),
  )
  return sectionRows
    .filter((s) => !s.removalRequestedAt)
    .map((s) => ({
      id: s.id,
      title: s.title,
      isNew: s.liveSince === null,
      lessons: lessonRows
        .filter((l) => l.lesson.sectionId === s.id && !l.lesson.removalRequestedAt)
        .map(({ lesson: l, videoStatus }) => ({
          id: l.id,
          title: l.title,
          type: l.type,
          isPreview: l.isPreview,
          durationSec: l.durationSec,
          isNew: l.liveSince === null,
          videoStatus: videoStatus ?? null,
          resourceCount: resources.filter((r) => r.lessonId === l.id).length,
        })),
    }))
}

/** Everything a reviewer needs to check one lesson: a signed video, the article, file links. */
export async function previewLessonForReview(
  ctx: Ctx,
  input: { revisionId: string; lessonId: string },
) {
  requireStaff(ctx.actor, canReviewCourses)
  const { course } = await loadSubmitted(ctx, input.revisionId)
  const lesson = await repo.getLesson(ctx.db, input.lessonId)
  if (!lesson || lesson.courseId !== course.id) throw new NotFoundError('LESSON_NOT_FOUND')
  const asset = lesson.videoAssetId
    ? (await getVideoAssets(ctx, [lesson.videoAssetId])).get(lesson.videoAssetId)
    : undefined
  const resources = await repo.resourcesOf(ctx.db, [lesson.id])
  return {
    id: lesson.id,
    title: lesson.title,
    type: lesson.type,
    embedUrl: asset ? videoPreviewUrl(ctx, asset) : null,
    videoStatus: asset?.status ?? null,
    articleHtml: lesson.articleHtml,
    resources: await Promise.all(
      resources.map(async (r) => ({
        id: r.id,
        title: r.title,
        isImportant: r.isImportant,
        mime: r.mime,
        sizeBytes: r.sizeBytes,
        url: await privateFileUrl(ctx, { bucket: r.bucket, key: r.key }, r.title),
      })),
    ),
  }
}

/**
 * Approve (all checklist items ticked) or request changes (notes required, citing the checklist
 * item or rule). Emails the instructor and writes the audit log.
 */
export async function decideReview(
  ctx: Ctx,
  input: {
    revisionId: string
    decision: 'approve' | 'request_changes'
    notes: string
    checklist: Partial<Record<ReviewChecklistKey, boolean>>
  },
) {
  const reviewer = requireStaff(ctx.actor, canReviewCourses)
  const approve = input.decision === 'approve'
  if (approve && !reviewChecklistKeys.every((k) => input.checklist[k])) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'checklist', message: 'Tick every checklist item before approving.' }],
    })
  }
  const result = await inTransaction(ctx, async (tx) => {
    const revision = await repo.lockRevision(tx.db, input.revisionId)
    if (!revision) throw new NotFoundError('REVISION_NOT_FOUND')
    const course = await repo.lockCourse(tx.db, revision.courseId)
    if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
    if (revision.status !== 'submitted') throw new ConflictError('COURSE_NOT_IN_REVIEW')
    if (course.instructorId === reviewer.userId) {
      throw new ForbiddenError('SELF_REVIEW_NOT_ALLOWED')
    }
    const checklist = Object.fromEntries(
      reviewChecklistKeys.map((k) => [k, Boolean(input.checklist[k])]),
    )
    let firstPublish = false
    if (approve) {
      firstPublish = await applyRevision(tx, course, revision, {
        reviewerId: reviewer.userId,
        notes: input.notes,
        checklist,
      })
    } else {
      await repo.updateRevision(tx.db, revision.id, {
        status: 'rejected',
        reviewedBy: reviewer.userId,
        reviewedAt: tx.now,
        reviewNotes: input.notes,
        reviewChecklist: checklist,
      })
      await repo.updateCourse(tx.db, course.id, {
        version: course.version + 1,
        ...(course.liveRevisionId ? {} : { status: 'changes_requested' as const }),
      })
      await tx.events.emit('course.changes_requested', {
        courseId: course.id,
        revisionId: revision.id,
      })
    }
    await writeAudit(tx, {
      action: approve ? 'course_review.approve' : 'course_review.request_changes',
      targetType: 'course_revision',
      targetId: revision.id,
      before: { status: revision.status },
      after: { status: approve ? 'approved' : 'rejected', notes: input.notes, checklist },
    })
    const contact = await getUserContact(tx, course.instructorId)
    const urls = provider(tx, 'urls')
    await notify(tx, {
      userId: course.instructorId,
      type: 'course.review_decision',
      title: approve ? `${revision.title} is live` : `${revision.title} needs changes`,
      link: approve ? `/courses/${course.slug}` : `/teach/courses/${course.id}/publish`,
      email: {
        id: 'course-review-decision',
        data: {
          name: contact.name,
          courseTitle: revision.title,
          approved: approve,
          notes: approve ? null : input.notes,
          url: approve
            ? `${urls.app}/courses/${course.slug}`
            : `${urls.app}/teach/courses/${course.id}/publish`,
        },
        businessKey: revision.id,
      },
    })
    return { courseId: course.id, instructorId: course.instructorId, firstPublish }
  })
  if (approve && result.firstPublish) {
    ctx.afterCommit(() =>
      track(
        ctx,
        'course_published',
        { course_id: result.courseId },
        { distinctId: result.instructorId },
      ),
    )
  }
  return getReview(ctx, input.revisionId)
}
