import type { RichTextDoc } from '@tokslearn/contract'
import { track } from '../analytics'
import { courseTagNames, requireCategory, setCourseTags } from '../catalog'
import { hasRole, type UserActor } from '../kernel/actor'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import {
  createVideoAsset,
  getFiles,
  getOwnedUploadedFile,
  getVideoAssets,
  publicFileUrl,
  refreshVideoAsset,
} from '../media'
import * as repo from './repo'
import { renderRichText, richTextToPlain } from './rich-text'
import {
  canEditCourse,
  canViewCourseInStudio,
  courseSlug,
  type OutlineLesson,
  publishChecklist,
  validPrice,
} from './rules'

// Instructor studio (docs/10 §1, docs/20 §5). Every write locks the course row, checks the
// caller may edit it, compares the autosave version (VERSION_CONFLICT on a stale tab) and makes
// sure an editable draft revision exists. Writes return the refreshed studio view.

export interface StudioResource {
  id: string
  title: string
  isImportant: boolean
  fileId: string
  mime: string
  sizeBytes: number
}

export interface StudioLesson {
  id: string
  sectionId: string
  title: string
  type: repo.LessonRow['type']
  position: number
  isPreview: boolean
  durationSec: number
  isLive: boolean
  removalRequested: boolean
  video: {
    assetId: string
    status: 'uploading' | 'processing' | 'ready' | 'failed'
    filename: string
  } | null
  articleDoc: RichTextDoc | null
  resources: StudioResource[]
  /** Quiz and exam lessons: the quiz to edit in the assessments tab (Phase 6). */
  quizId: string | null
  assignmentId: string | null
}

export interface StudioSection {
  id: string
  title: string
  position: number
  isLive: boolean
  removalRequested: boolean
  lessons: StudioLesson[]
}

export interface StudioCourse {
  id: string
  slug: string
  status: repo.CourseRow['status']
  version: number
  isPublished: boolean
  canEdit: boolean
  revision: {
    id: string
    number: number
    status: repo.RevisionRow['status']
    title: string
    subtitle: string | null
    descriptionDoc: RichTextDoc | null
    outcomes: string[]
    requirements: string[]
    categoryId: string | null
    level: repo.RevisionRow['level']
    language: string
    priceKobo: bigint
    compareAtKobo: bigint | null
    refundPolicyDays: number
    certificateMode: repo.RevisionRow['certificateMode']
    certificateSettings: Record<string, unknown>
    coverFileId: string | null
    coverUrl: string | null
    promo: {
      assetId: string
      status: 'uploading' | 'processing' | 'ready' | 'failed'
      filename: string
      durationSec: number | null
    } | null
    reviewNotes: string | null
  }
  /** Live price, to warn when an update raises it by more than half. */
  livePriceKobo: bigint | null
  tags: string[]
  sections: StudioSection[]
  checklist: Array<{ key: ReturnType<typeof publishChecklist>[number]['key']; done: boolean }>
  history: Awaited<ReturnType<typeof repo.revisionHistory>>
}

// ─── Reading ───────────────────────────────────────────────────────────────────────────────────

async function buildOutline(ctx: Ctx, courseId: string): Promise<StudioSection[]> {
  const [sectionRows, lessonRows] = await Promise.all([
    repo.sectionsOf(ctx.db, courseId),
    repo.lessonsOf(ctx.db, courseId),
  ])
  const resources = await repo.resourcesOf(
    ctx.db,
    lessonRows.map((l) => l.lesson.id),
  )
  return sectionRows.map((s) => ({
    id: s.id,
    title: s.title,
    position: s.position,
    isLive: s.liveSince !== null,
    removalRequested: s.removalRequestedAt !== null,
    lessons: lessonRows
      .filter((l) => l.lesson.sectionId === s.id)
      .map(({ lesson: l, videoStatus, videoFilename }) => ({
        id: l.id,
        sectionId: l.sectionId,
        title: l.title,
        type: l.type,
        position: l.position,
        isPreview: l.isPreview,
        durationSec: l.durationSec,
        isLive: l.liveSince !== null,
        removalRequested: l.removalRequestedAt !== null,
        video:
          l.videoAssetId && videoStatus
            ? { assetId: l.videoAssetId, status: videoStatus, filename: videoFilename ?? '' }
            : null,
        articleDoc: (l.articleDoc as RichTextDoc | null) ?? null,
        quizId: l.quizId,
        assignmentId: l.assignmentId,
        resources: resources
          .filter((r) => r.lessonId === l.id)
          .map((r) => ({
            id: r.id,
            title: r.title,
            isImportant: r.isImportant,
            fileId: r.fileId,
            mime: r.mime,
            sizeBytes: r.sizeBytes,
          })),
      })),
  }))
}

/** Sections and lessons that will be live once this revision is approved. */
export function activeOutline(sections: ReadonlyArray<StudioSection>) {
  return sections
    .filter((s) => !s.removalRequested)
    .map((s) => ({ ...s, lessons: s.lessons.filter((l) => !l.removalRequested) }))
}

export const outlineLessonFacts = (l: StudioLesson): OutlineLesson => ({
  type: l.type,
  isPreview: l.isPreview,
  durationSec: l.durationSec,
  videoStatus: l.type === 'video' ? (l.video?.status ?? null) : null,
  hasArticle: Boolean(l.articleDoc && richTextToPlain(l.articleDoc).length > 0),
  resourceCount: l.resources.length,
})

export function checklistFor(revision: repo.RevisionRow, sections: ReadonlyArray<StudioSection>) {
  return publishChecklist({
    title: revision.title,
    subtitle: revision.subtitle,
    descriptionChars: richTextToPlain(revision.descriptionDoc as RichTextDoc | null).length,
    outcomes: revision.outcomes,
    categoryId: revision.categoryId,
    hasCover: revision.coverFileId !== null,
    priceKobo: revision.priceKobo,
    sections: activeOutline(sections).map((s) => ({ lessons: s.lessons.map(outlineLessonFacts) })),
  })
}

async function loadViewable(ctx: Ctx, courseId: string) {
  const user = requireUser(ctx.actor)
  const course = await repo.getCourse(ctx.db, courseId)
  if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
  const staff =
    !canEditCourse(user, course) && (await repo.isCourseStaff(ctx.db, course.id, user.userId))
  if (!canViewCourseInStudio(user, course, staff)) throw new NotFoundError('COURSE_NOT_FOUND')
  return { user, course }
}

export async function getStudioCourse(ctx: Ctx, courseId: string): Promise<StudioCourse> {
  const { user, course } = await loadViewable(ctx, courseId)
  const revisionId = course.draftRevisionId ?? course.liveRevisionId
  const revision = revisionId ? await repo.getRevision(ctx.db, revisionId) : undefined
  if (!revision) throw new NotFoundError('COURSE_NOT_FOUND')
  const [sections, tags, history] = await Promise.all([
    buildOutline(ctx, course.id),
    courseTagNames(ctx, course.id),
    repo.revisionHistory(ctx.db, course.id),
  ])
  const [cover, promo] = await Promise.all([
    revision.coverFileId
      ? getFiles(ctx, [revision.coverFileId]).then((m) => m.get(revision.coverFileId ?? ''))
      : Promise.resolve(undefined),
    revision.promoVideoId
      ? getVideoAssets(ctx, [revision.promoVideoId]).then((m) => m.get(revision.promoVideoId ?? ''))
      : Promise.resolve(undefined),
  ])
  return {
    id: course.id,
    slug: course.slug,
    status: course.status,
    version: course.version,
    isPublished: course.liveRevisionId !== null,
    canEdit: canEditCourse(user, course),
    revision: {
      id: revision.id,
      number: revision.number,
      status: revision.status,
      title: revision.title,
      subtitle: revision.subtitle,
      descriptionDoc: (revision.descriptionDoc as RichTextDoc | null) ?? null,
      outcomes: revision.outcomes,
      requirements: revision.requirements,
      categoryId: revision.categoryId,
      level: revision.level,
      language: revision.language,
      priceKobo: revision.priceKobo,
      compareAtKobo: revision.compareAtKobo,
      refundPolicyDays: revision.refundPolicyDays,
      certificateMode: revision.certificateMode,
      certificateSettings: revision.certificateSettings,
      coverFileId: revision.coverFileId,
      coverUrl: cover ? publicFileUrl(ctx, cover.key) : null,
      promo: promo
        ? {
            assetId: promo.id,
            status: promo.status,
            filename: promo.filename,
            durationSec: promo.durationSec,
          }
        : null,
      reviewNotes: revision.status === 'rejected' ? revision.reviewNotes : null,
    },
    livePriceKobo: course.liveRevisionId ? course.priceKobo : null,
    tags,
    sections,
    checklist: checklistFor(revision, sections),
    history,
  }
}

export async function listMyCourses(ctx: Ctx) {
  const user = requireUser(ctx.actor)
  return repo.coursesOf(ctx.db, user.userId)
}

// ─── Writing ───────────────────────────────────────────────────────────────────────────────────

/** Draft revision to edit: the current draft, or a copy of the live one after publishing. */
async function ensureDraft(tx: Ctx, course: repo.CourseRow): Promise<repo.RevisionRow> {
  if (course.draftRevisionId) {
    const draft = await repo.getRevision(tx.db, course.draftRevisionId)
    if (!draft) throw new NotFoundError('REVISION_NOT_FOUND')
    if (draft.status === 'submitted') throw new ConflictError('COURSE_NOT_EDITABLE')
    if (draft.status === 'rejected')
      return repo.updateRevision(tx.db, draft.id, { status: 'draft' })
    return draft
  }
  const live = course.liveRevisionId
    ? await repo.getRevision(tx.db, course.liveRevisionId)
    : undefined
  if (!live) throw new NotFoundError('REVISION_NOT_FOUND')
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    number: _n,
    status: _s,
    snapshot: _snap,
    reviewChecklist: _rc,
    reviewNotes: _rn,
    reviewedBy: _rb,
    reviewedAt: _ra,
    submittedAt: _sa,
    ...copy
  } = live
  const draft = await repo.insertRevision(tx.db, {
    ...copy,
    number: await repo.nextRevisionNumber(tx.db, course.id),
    status: 'draft',
  })
  await repo.updateCourse(tx.db, course.id, { draftRevisionId: draft.id })
  return draft
}

async function denyEdit(ctx: Ctx, user: UserActor, course: repo.CourseRow): Promise<never> {
  // Staff get a clear "only the instructor" message; everyone else can't tell the course exists.
  if (await repo.isCourseStaff(ctx.db, course.id, user.userId)) {
    throw new ForbiddenError('NOT_COURSE_OWNER')
  }
  throw new NotFoundError('COURSE_NOT_FOUND')
}

interface Edit {
  course: repo.CourseRow
  revision: repo.RevisionRow
  user: UserActor
}

/** Runs one studio write and returns the refreshed course. */
async function edit(
  ctx: Ctx,
  courseId: string,
  version: number,
  fn: (tx: Ctx, e: Edit) => Promise<void>,
): Promise<StudioCourse> {
  const user = requireUser(ctx.actor)
  await inTransaction(ctx, async (tx) => {
    const course = await repo.lockCourse(tx.db, courseId)
    if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
    if (!canEditCourse(user, course)) await denyEdit(tx, user, course)
    if (course.status === 'archived') throw new ConflictError('COURSE_NOT_EDITABLE')
    if (course.version !== version) throw new ConflictError('VERSION_CONFLICT')
    const revision = await ensureDraft(tx, course)
    await fn(tx, { course, revision, user })
    await repo.updateCourse(tx.db, course.id, { version: course.version + 1 })
  })
  return getStudioCourse(ctx, courseId)
}

async function uniqueSlug(ctx: Ctx, title: string): Promise<string> {
  const base = courseSlug(title)
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`
    if (!(await repo.isSlugTaken(ctx.db, slug))) return slug
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function createCourse(ctx: Ctx, input: { title: string; categoryId: string }) {
  const user = requireUser(ctx.actor)
  if (!hasRole(user, 'instructor')) throw new ForbiddenError('INSTRUCTOR_REQUIRED')
  await requireCategory(ctx, input.categoryId)
  const courseId = await inTransaction(ctx, async (tx) => {
    const course = await repo.insertCourse(tx.db, {
      instructorId: user.userId,
      slug: await uniqueSlug(tx, input.title),
      categoryId: input.categoryId,
    })
    const revision = await repo.insertRevision(tx.db, {
      courseId: course.id,
      number: 1,
      title: input.title.trim(),
      categoryId: input.categoryId,
    })
    await repo.updateCourse(tx.db, course.id, { draftRevisionId: revision.id })
    return course.id
  })
  ctx.afterCommit(() => track(ctx, 'course_created', { course_id: courseId }))
  return getStudioCourse(ctx, courseId)
}

export interface DetailsInput {
  courseId: string
  version: number
  title: string
  subtitle: string | null
  description: RichTextDoc | null
  outcomes: string[]
  requirements: string[]
  level: repo.RevisionRow['level']
  language: string
  categoryId: string
  coverFileId: string | null
  tags: string[]
}

export async function updateDetails(ctx: Ctx, input: DetailsInput) {
  await requireCategory(ctx, input.categoryId)
  return edit(ctx, input.courseId, input.version, async (tx, { course, revision }) => {
    let coverFileId = revision.coverFileId
    if (input.coverFileId !== revision.coverFileId) {
      coverFileId = input.coverFileId
        ? (await getOwnedUploadedFile(tx, input.coverFileId, 'cover')).id
        : null
    }
    await repo.updateRevision(tx.db, revision.id, {
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || null,
      descriptionDoc: input.description as Record<string, unknown> | null,
      descriptionHtml: input.description ? renderRichText(input.description) : null,
      outcomes: input.outcomes.map((o) => o.trim()).filter(Boolean),
      requirements: input.requirements.map((r) => r.trim()).filter(Boolean),
      level: input.level,
      language: input.language,
      categoryId: input.categoryId,
      coverFileId,
    })
    await setCourseTags(tx, course.id, input.tags)
  })
}

export async function updatePricing(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    priceKobo: bigint
    compareAtKobo: bigint | null
    refundPolicyDays: 0 | 3 | 7 | 14
  },
) {
  if (!validPrice(input.priceKobo)) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'priceKobo', message: 'Free, or between ₦1,000 and ₦5,000,000.' }],
    })
  }
  if (input.compareAtKobo !== null && input.compareAtKobo <= input.priceKobo) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'compareAtKobo', message: 'The old price must be higher than the price.' }],
    })
  }
  return edit(ctx, input.courseId, input.version, async (tx, { revision }) => {
    await repo.updateRevision(tx.db, revision.id, {
      priceKobo: input.priceKobo,
      compareAtKobo: input.priceKobo === 0n ? null : input.compareAtKobo,
      refundPolicyDays: input.refundPolicyDays,
    })
  })
}

/**
 * Certificate mode and rules on the draft (docs/10 §8). The certificates module checks the rules
 * (the exam belongs to this course, a provider is named) before calling this.
 */
export async function updateCertificateSettings(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    mode: repo.RevisionRow['certificateMode']
    settings: Record<string, unknown>
  },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { revision }) => {
    await repo.updateRevision(tx.db, revision.id, {
      certificateMode: input.mode,
      certificateSettings: input.settings,
    })
  })
}

// ─── Curriculum ────────────────────────────────────────────────────────────────────────────────

async function sectionOf(tx: Ctx, courseId: string, sectionId: string) {
  const section = await repo.getSection(tx.db, sectionId)
  if (!section || section.courseId !== courseId) throw new NotFoundError('SECTION_NOT_FOUND')
  return section
}

async function lessonOf(tx: Ctx, courseId: string, lessonId: string) {
  const lesson = await repo.getLesson(tx.db, lessonId)
  if (!lesson || lesson.courseId !== courseId) throw new NotFoundError('LESSON_NOT_FOUND')
  return lesson
}

export async function addSection(
  ctx: Ctx,
  input: { courseId: string; version: number; title: string },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    await repo.insertSection(tx.db, {
      courseId: course.id,
      title: input.title.trim(),
      position: (await repo.maxSectionPosition(tx.db, course.id)) + 1,
    })
  })
}

export async function renameSection(
  ctx: Ctx,
  input: { courseId: string; version: number; sectionId: string; title: string },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    await sectionOf(tx, course.id, input.sectionId)
    await repo.updateSection(tx.db, input.sectionId, { title: input.title.trim() })
  })
}

/** Never-live sections are deleted with their lessons; live ones leave on the next approval. */
export async function removeSection(
  ctx: Ctx,
  input: { courseId: string; version: number; sectionId: string },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    const section = await sectionOf(tx, course.id, input.sectionId)
    if (section.liveSince) {
      await repo.updateSection(tx.db, section.id, { removalRequestedAt: tx.now })
      return
    }
    const lessons = (await repo.lessonsOf(tx.db, course.id)).filter(
      (l) => l.lesson.sectionId === section.id,
    )
    if (lessons.some((l) => l.lesson.liveSince)) throw new RuleViolationError('INVALID_MOVE')
    await repo.deleteLessons(
      tx.db,
      lessons.map((l) => l.lesson.id),
    )
    await repo.deleteSection(tx.db, section.id)
  })
}

export async function moveSection(
  ctx: Ctx,
  input: { courseId: string; version: number; sectionId: string; toIndex: number },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    const all = await repo.sectionsOf(tx.db, course.id)
    const from = all.findIndex((s) => s.id === input.sectionId)
    if (from === -1 || input.toIndex < 0 || input.toIndex >= all.length) {
      throw new RuleViolationError('INVALID_MOVE')
    }
    const [moved] = all.splice(from, 1)
    if (moved) all.splice(input.toIndex, 0, moved)
    for (const [position, s] of all.entries()) {
      if (s.position !== position) await repo.updateSection(tx.db, s.id, { position })
    }
  })
}

export async function addLesson(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    sectionId: string
    type: 'video' | 'article' | 'resource' | 'quiz' | 'assignment'
    title: string
    /**
     * Quiz and assignment lessons: creates their quiz or assignment inside the same transaction
     * (assessments and assignments own those rows) and returns its id to link.
     */
    attach?: (
      tx: Ctx,
      course: { id: string },
    ) => Promise<{ quizId?: string; assignmentId?: string }>
  },
) {
  if ((input.type === 'quiz' || input.type === 'assignment') && !input.attach) {
    throw new Error(`${input.type} lessons are created through their own module`)
  }
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    const section = await sectionOf(tx, course.id, input.sectionId)
    if (section.removalRequestedAt) throw new RuleViolationError('INVALID_MOVE')
    const linked = input.attach ? await input.attach(tx, course) : {}
    await repo.insertLesson(tx.db, {
      courseId: course.id,
      sectionId: section.id,
      type: input.type,
      title: input.title.trim(),
      position: (await repo.maxLessonPosition(tx.db, section.id)) + 1,
      quizId: input.type === 'quiz' ? (linked.quizId ?? null) : null,
      assignmentId: input.type === 'assignment' ? (linked.assignmentId ?? null) : null,
    })
  })
}

export async function updateLesson(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    lessonId: string
    title?: string | undefined
    isPreview?: boolean | undefined
    article?: RichTextDoc | null | undefined
  },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    const lesson = await lessonOf(tx, course.id, input.lessonId)
    if (input.article !== undefined && lesson.type !== 'article') {
      throw new RuleViolationError('VALIDATION_FAILED', {
        issues: [{ path: 'article', message: 'Only article lessons have text.' }],
      })
    }
    await repo.updateLesson(tx.db, lesson.id, {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.isPreview !== undefined ? { isPreview: input.isPreview } : {}),
      ...(input.article !== undefined
        ? {
            articleDoc: input.article as Record<string, unknown> | null,
            articleHtml: input.article ? renderRichText(input.article) : null,
            // Reading time at ~200 words a minute counts toward the course length.
            durationSec: input.article
              ? Math.ceil(richTextToPlain(input.article).split(' ').filter(Boolean).length / 200) *
                60
              : 0,
          }
        : {}),
    })
  })
}

export async function removeLesson(
  ctx: Ctx,
  input: { courseId: string; version: number; lessonId: string },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    const lesson = await lessonOf(tx, course.id, input.lessonId)
    if (lesson.liveSince) {
      await repo.updateLesson(tx.db, lesson.id, { removalRequestedAt: tx.now })
    } else {
      await repo.deleteLessons(tx.db, [lesson.id])
    }
  })
}

/** Moves a lesson within or between sections; positions are renumbered 0…n. */
export async function moveLesson(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    lessonId: string
    toSectionId: string
    toIndex: number
  },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    const lesson = await lessonOf(tx, course.id, input.lessonId)
    const target = await sectionOf(tx, course.id, input.toSectionId)
    if (target.removalRequestedAt) throw new RuleViolationError('INVALID_MOVE')
    const all = (await repo.lessonsOf(tx.db, course.id)).map((l) => l.lesson)
    const source = all.filter((l) => l.sectionId === lesson.sectionId && l.id !== lesson.id)
    const dest =
      target.id === lesson.sectionId ? source : all.filter((l) => l.sectionId === target.id)
    if (input.toIndex < 0 || input.toIndex > dest.length)
      throw new RuleViolationError('INVALID_MOVE')
    dest.splice(input.toIndex, 0, { ...lesson, sectionId: target.id })
    const renumber = async (list: repo.LessonRow[]) => {
      for (const [position, l] of list.entries()) {
        const moved = l.id === lesson.id
        if (moved || l.position !== position) {
          await repo.updateLesson(tx.db, l.id, {
            position,
            ...(moved ? { sectionId: target.id } : {}),
          })
        }
      }
    }
    await renumber(dest)
    if (target.id !== lesson.sectionId) await renumber(source)
  })
}

// ─── Resources and video ───────────────────────────────────────────────────────────────────────

export async function addResource(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    lessonId: string
    fileId: string
    title: string
    isImportant: boolean
  },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    const lesson = await lessonOf(tx, course.id, input.lessonId)
    const file = await getOwnedUploadedFile(tx, input.fileId, 'resource')
    await repo.insertResource(tx.db, {
      lessonId: lesson.id,
      fileId: file.id,
      title: input.title.trim(),
      isImportant: input.isImportant,
    })
  })
}

async function resourceOf(tx: Ctx, courseId: string, resourceId: string) {
  const resource = await repo.getResource(tx.db, resourceId)
  if (!resource) throw new NotFoundError('FILE_NOT_FOUND')
  await lessonOf(tx, courseId, resource.lessonId)
  return resource
}

export async function updateResource(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    resourceId: string
    title?: string | undefined
    isImportant?: boolean | undefined
  },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    const resource = await resourceOf(tx, course.id, input.resourceId)
    await repo.updateResource(tx.db, resource.id, {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.isImportant !== undefined ? { isImportant: input.isImportant } : {}),
    })
  })
}

export async function removeResource(
  ctx: Ctx,
  input: { courseId: string; version: number; resourceId: string },
) {
  return edit(ctx, input.courseId, input.version, async (tx, { course }) => {
    const resource = await resourceOf(tx, course.id, input.resourceId)
    await repo.deleteResource(tx.db, resource.id)
  })
}

/**
 * Creates the Bunny video (outside the transaction), then attaches it to the lesson. Returns
 * the signed TUS headers for tus-js-client; the API key never reaches the browser.
 */
export async function startLessonVideoUpload(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    lessonId: string
    filename: string
    sizeBytes: number
    mime: string
  },
) {
  const user = requireUser(ctx.actor)
  const course = await repo.getCourse(ctx.db, input.courseId)
  if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
  if (!canEditCourse(user, course)) await denyEdit(ctx, user, course)
  const lesson = await lessonOf(ctx, course.id, input.lessonId)
  if (lesson.type !== 'video') {
    throw new RuleViolationError('UNSUPPORTED_FILE_TYPE', { types: 'a video lesson' })
  }
  const title = await repo.getRevision(
    ctx.db,
    course.draftRevisionId ?? course.liveRevisionId ?? '',
  )
  const { asset, upload } = await createVideoAsset(ctx, {
    title: `${title?.title ?? 'Course'} — ${lesson.title}`,
    filename: input.filename,
    sizeBytes: input.sizeBytes,
    mime: input.mime,
  })
  const studio = await edit(ctx, course.id, input.version, async (tx) => {
    await repo.updateLesson(tx.db, lesson.id, { videoAssetId: asset.id, durationSec: 0 })
  })
  return { studio, videoAssetId: asset.id, upload }
}

/** Copies a video's duration onto its lessons and refreshes live totals. Job or studio. */
export async function onVideoAssetChanged(ctx: Ctx, videoAssetId: string) {
  const asset = (await getVideoAssets(ctx, [videoAssetId])).get(videoAssetId)
  if (!asset) return
  const lessons = await repo.lessonsWithVideo(ctx.db, videoAssetId)
  const durationSec = asset.status === 'ready' ? (asset.durationSec ?? 0) : 0
  await inTransaction(ctx, async (tx) => {
    for (const l of lessons) await repo.updateLesson(tx.db, l.id, { durationSec })
    for (const courseId of new Set(lessons.filter((l) => l.liveSince).map((l) => l.courseId))) {
      await repo.recomputeTotals(tx.db, courseId)
    }
  })
  if (asset.status === 'ready') {
    ctx.afterCommit(() =>
      track(
        ctx,
        'video_uploaded',
        {
          size_mb: Math.round(asset.sizeBytes / (1024 * 1024)),
          duration_sec: asset.durationSec ?? 0,
          upload_duration_sec: Math.round(
            ((asset.readyAt ?? ctx.now).getTime() - asset.createdAt.getTime()) / 1000,
          ),
        },
        { distinctId: asset.ownerId },
      ),
    )
  }
}

/** "Check again" in the studio: asks Bunny for the latest status of a lesson's video. */
export async function refreshLessonVideo(ctx: Ctx, input: { courseId: string; lessonId: string }) {
  const { user, course } = await loadViewable(ctx, input.courseId)
  if (!canEditCourse(user, course)) await denyEdit(ctx, user, course)
  const lesson = await lessonOf(ctx, course.id, input.lessonId)
  if (lesson.videoAssetId) {
    const { changed } = await refreshVideoAsset(ctx, lesson.videoAssetId)
    if (changed) await onVideoAssetChanged(ctx, lesson.videoAssetId)
  }
  return getStudioCourse(ctx, course.id)
}

/** Uploads the course trailer (docs/20 details: promo video), shown on the course page. */
export async function startPromoVideoUpload(
  ctx: Ctx,
  input: { courseId: string; version: number; filename: string; sizeBytes: number; mime: string },
) {
  const user = requireUser(ctx.actor)
  const course = await repo.getCourse(ctx.db, input.courseId)
  if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
  if (!canEditCourse(user, course)) await denyEdit(ctx, user, course)
  const revision = await repo.getRevision(
    ctx.db,
    course.draftRevisionId ?? course.liveRevisionId ?? '',
  )
  const { asset, upload } = await createVideoAsset(ctx, {
    title: `${revision?.title ?? 'Course'} — preview`,
    filename: input.filename,
    sizeBytes: input.sizeBytes,
    mime: input.mime,
  })
  const studio = await edit(ctx, course.id, input.version, async (tx, e) => {
    await repo.updateRevision(tx.db, e.revision.id, { promoVideoId: asset.id })
  })
  return { studio, videoAssetId: asset.id, upload }
}

export async function removePromoVideo(ctx: Ctx, input: { courseId: string; version: number }) {
  return edit(ctx, input.courseId, input.version, async (tx, e) => {
    await repo.updateRevision(tx.db, e.revision.id, { promoVideoId: null })
  })
}

/** "Check again" for the trailer while Bunny is still encoding it. */
export async function refreshPromoVideo(ctx: Ctx, input: { courseId: string }) {
  const { user, course } = await loadViewable(ctx, input.courseId)
  if (!canEditCourse(user, course)) await denyEdit(ctx, user, course)
  const revision = await repo.getRevision(
    ctx.db,
    course.draftRevisionId ?? course.liveRevisionId ?? '',
  )
  if (revision?.promoVideoId) await refreshVideoAsset(ctx, revision.promoVideoId)
  return getStudioCourse(ctx, course.id)
}
