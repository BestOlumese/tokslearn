import { schema } from '@tokslearn/db'
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { refundablePurchase } from '../commerce'
import { dripUnlocksAt, lessonAccess } from '../enrollments'
import { hasRole, isUser, type UserActor } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { ForbiddenError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { getFiles, getVideoAssets, publicFileUrl } from '../media'

// The course player's reads (docs/10 §3, docs/20 `/learn/…`): outline with ticks and drip locks,
// and one lesson with everything its page needs. Access is decided by enrollments.lessonAccess.
// Foreign reads (docs/03 §3): courses, course_revisions, sections, lessons, lesson_resources,
// enrollments, course_staff, user, instructor_profiles.

const {
  courses,
  courseRevisions: revisions,
  sections,
  lessons,
  lessonResources,
  enrollments,
  lessonProgress,
  user,
  instructorProfiles,
} = schema

export type LessonType = 'video' | 'article' | 'quiz' | 'assignment' | 'live' | 'resource'
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'

export interface OutlineLesson {
  id: string
  title: string
  type: LessonType
  durationSec: number
  isPreview: boolean
  status: ProgressStatus
  /** Drip-locked for this learner, with the date it opens. */
  locked: boolean
  unlocksAt: Date | null
}

export interface LearnOutline {
  course: {
    id: string
    slug: string
    title: string
    instructorName: string
    coverUrl: string | null
    completionThresholdPct: number
  }
  /** How the viewer is here: an enrolled learner, or the course's teacher/staff checking it. */
  role: 'learner' | 'teaching'
  progressPct: number
  sections: Array<{ id: string; title: string; lessons: OutlineLesson[] }>
  /** First lesson not yet completed that the learner can open ("Continue learning"). */
  nextLessonId: string | null
}

const canSeeEverything = (actor: UserActor) => hasRole(actor, 'reviewer', 'admin', 'super_admin')

/** The player's outline. Visitors without access get NOT_ENROLLED (the page sends them back). */
export async function getCourseOutline(ctx: Ctx, courseSlug: string): Promise<LearnOutline> {
  const actor = requireUser(ctx.actor)
  const [course] = await ctx.db
    .select({
      id: courses.id,
      slug: courses.slug,
      status: courses.status,
      dripMode: courses.dripMode,
      instructorId: courses.instructorId,
      completionThresholdPct: courses.completionThresholdPct,
      title: revisions.title,
      coverFileId: revisions.coverFileId,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
      staff: sql<boolean>`exists (select 1 from course_staff cs where cs.course_id = ${courses.id} and cs.user_id = ${actor.userId})`,
    })
    .from(courses)
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .where(and(eq(courses.slug, courseSlug), isNull(courses.deletedAt)))
  if (!course) throw new NotFoundError('COURSE_NOT_FOUND')

  const teaching = course.instructorId === actor.userId || course.staff || canSeeEverything(actor)
  const [enrollment] = await ctx.db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.userId, actor.userId), eq(enrollments.courseId, course.id)))
  if (!teaching) {
    if (!enrollment) throw new ForbiddenError('NOT_ENROLLED')
    const expired = enrollment.accessExpiresAt !== null && enrollment.accessExpiresAt <= ctx.now
    if (enrollment.status === 'revoked' || enrollment.status === 'expired' || expired) {
      throw new ForbiddenError('ENROLLMENT_REVOKED')
    }
  }

  const [sectionRows, lessonRows, progressRows] = await Promise.all([
    ctx.db
      .select({ id: sections.id, title: sections.title })
      .from(sections)
      .where(eq(sections.courseId, course.id))
      .orderBy(asc(sections.position)),
    ctx.db
      .select({
        id: lessons.id,
        sectionId: lessons.sectionId,
        title: lessons.title,
        type: lessons.type,
        durationSec: lessons.durationSec,
        isPreview: lessons.isPreview,
        dripOffsetDays: lessons.dripOffsetDays,
        dripDate: lessons.dripDate,
      })
      .from(lessons)
      .where(
        and(
          eq(lessons.courseId, course.id),
          isNotNull(lessons.liveSince),
          isNull(lessons.deletedAt),
        ),
      )
      .orderBy(asc(lessons.position)),
    ctx.db
      .select({ lessonId: lessonProgress.lessonId, status: lessonProgress.status })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, actor.userId), eq(lessonProgress.courseId, course.id))),
  ])
  const statusOf = new Map(progressRows.map((p) => [p.lessonId, p.status]))
  const lock = (l: (typeof lessonRows)[number]) => {
    if (teaching || !enrollment || statusOf.has(l.id)) return null
    const at = dripUnlocksAt(course.dripMode, l, enrollment.createdAt)
    return at && at > ctx.now ? at : null
  }
  const shaped = sectionRows
    .map((s) => ({
      id: s.id,
      title: s.title,
      lessons: lessonRows
        .filter((l) => l.sectionId === s.id)
        .map((l): OutlineLesson => {
          const unlocksAt = lock(l)
          return {
            id: l.id,
            title: l.title,
            type: l.type,
            durationSec: l.durationSec,
            isPreview: l.isPreview,
            status: statusOf.get(l.id) ?? 'not_started',
            locked: unlocksAt !== null,
            unlocksAt,
          }
        }),
    }))
    .filter((s) => s.lessons.length > 0)
  const flat = shaped.flatMap((s) => s.lessons)
  const next =
    flat.find((l) => l.status !== 'completed' && !l.locked) ?? flat.find((l) => !l.locked)
  const cover = course.coverFileId
    ? (await getFiles(ctx, [course.coverFileId])).get(course.coverFileId)
    : undefined

  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      instructorName: course.instructorName,
      coverUrl: cover?.bucket === 'public' ? publicFileUrl(ctx, cover.key) : null,
      completionThresholdPct: course.completionThresholdPct,
    },
    role: teaching && !enrollment ? 'teaching' : 'learner',
    progressPct: enrollment?.progressPct ?? 0,
    sections: shaped,
    nextLessonId: next?.id ?? null,
  }
}

export interface LessonResourceView {
  id: string
  title: string
  filename: string
  mime: string
  sizeBytes: number
  isImportant: boolean
}

export interface LearnLesson {
  id: string
  courseId: string
  title: string
  type: LessonType
  durationSec: number
  articleHtml: string | null
  video: {
    status: 'uploading' | 'processing' | 'ready' | 'failed'
    posterUrl: string | null
  } | null
  resources: LessonResourceView[]
  progress: { status: ProgressStatus; positionSec: number }
  previousLessonId: string | null
  nextLessonId: string | null
  /** The learner's purchase can still be refunded: warn before important downloads. */
  refundable: boolean
  /** Light overlay on videos for leak tracing (docs/09 §1): name and a masked email. */
  watermark: string | null
}

/** "Month-end template" + "…/abc.xlsx" → "Month-end template.xlsx". */
export const downloadName = (title: string, key: string) => {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(key)?.[1]
  const base =
    title
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'download'
  return ext ? `${base}.${ext.toLowerCase()}` : base
}

/** LESSON_LOCKED with the Lagos date for the message ("opens on 2 October") and the instant. */
export const lessonLocked = (unlocksAt: Date) =>
  new RuleViolationError('LESSON_LOCKED', {
    date: new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      day: 'numeric',
      month: 'long',
    }).format(unlocksAt),
    unlocksAt: unlocksAt.toISOString(),
  })

const maskEmail = (email: string) => {
  const [name = '', domain = ''] = email.split('@')
  return `${name.slice(0, 2)}***@${domain}`
}

/**
 * One lesson for the player. Errors: LESSON_NOT_FOUND, NOT_ENROLLED, ENROLLMENT_REVOKED,
 * LESSON_LOCKED (with `date` and `unlocksAt`).
 */
export async function getLesson(ctx: Ctx, lessonId: string): Promise<LearnLesson> {
  const access = await lessonAccess(ctx, lessonId)
  if (access.reason === 'missing' || !access.courseId) throw new NotFoundError('LESSON_NOT_FOUND')
  if (access.reason === 'revoked') throw new ForbiddenError('ENROLLMENT_REVOKED')
  if (access.reason === 'locked' && access.unlocksAt) throw lessonLocked(access.unlocksAt)
  if (!access.allowed) throw new ForbiddenError('NOT_ENROLLED')

  const [lesson] = await ctx.db.select().from(lessons).where(eq(lessons.id, lessonId))
  if (!lesson) throw new NotFoundError('LESSON_NOT_FOUND')
  const actor = isUser(ctx.actor) ? ctx.actor : null

  const [order, resourceRows, progress, me, purchase] = await Promise.all([
    ctx.db
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(sections, eq(sections.id, lessons.sectionId))
      .where(
        and(
          eq(lessons.courseId, lesson.courseId),
          isNotNull(lessons.liveSince),
          isNull(lessons.deletedAt),
        ),
      )
      .orderBy(asc(sections.position), asc(lessons.position)),
    ctx.db
      .select()
      .from(lessonResources)
      .where(eq(lessonResources.lessonId, lessonId))
      .orderBy(asc(lessonResources.position)),
    actor
      ? ctx.db
          .select()
          .from(lessonProgress)
          .where(
            and(eq(lessonProgress.userId, actor.userId), eq(lessonProgress.lessonId, lessonId)),
          )
      : Promise.resolve([]),
    actor
      ? ctx.db
          .select({ name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, actor.userId))
      : Promise.resolve([]),
    actor && access.reason === 'enrolled'
      ? refundablePurchase(ctx, { userId: actor.userId, courseId: lesson.courseId })
      : Promise.resolve(null),
  ])
  const files = await getFiles(
    ctx,
    resourceRows.map((r) => r.fileId),
  )
  const asset = lesson.videoAssetId
    ? (await getVideoAssets(ctx, [lesson.videoAssetId])).get(lesson.videoAssetId)
    : undefined
  const index = order.findIndex((o) => o.id === lessonId)
  const p = progress[0]
  const person = me[0]

  return {
    id: lesson.id,
    courseId: lesson.courseId,
    title: lesson.title,
    type: lesson.type,
    durationSec: lesson.durationSec,
    articleHtml: lesson.type === 'article' ? lesson.articleHtml : null,
    video:
      lesson.type === 'video'
        ? asset
          ? { status: asset.status, posterUrl: asset.thumbnailUrl }
          : { status: 'uploading', posterUrl: null }
        : null,
    resources: resourceRows.flatMap((r) => {
      const f = files.get(r.fileId)
      return f
        ? [
            {
              id: r.id,
              title: r.title,
              filename: downloadName(r.title, f.key),
              mime: f.mime,
              sizeBytes: f.sizeBytes,
              isImportant: r.isImportant,
            },
          ]
        : []
    }),
    progress: { status: p?.status ?? 'not_started', positionSec: p?.positionSec ?? 0 },
    previousLessonId: index > 0 ? (order[index - 1]?.id ?? null) : null,
    nextLessonId: index >= 0 ? (order[index + 1]?.id ?? null) : null,
    refundable: purchase !== null,
    watermark: person ? `${person.name} · ${maskEmail(person.email)}` : null,
  }
}
