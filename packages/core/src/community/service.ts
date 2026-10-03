import type { RichTextDoc } from '@tokslearn/contract'
import { schema } from '@tokslearn/db'
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import { isFeatureEnabled, writeAudit } from '../admin'
import { track } from '../analytics'
import { renderRichText, richTextToPlain } from '../courses'
import { learnerDisplayName } from '../enrollments'
import { hasRole } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ForbiddenError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { notifyMany } from '../notifications'
import {
  BODY_MAX,
  contentProblem,
  countLinkMarks,
  excerpt,
  mentionedUsernames,
  TITLE_MAX,
  TITLE_MIN,
} from './rules'

// Community (docs/10 §10, docs/20 Phase 8 rows): threads and replies in a course, a cohort run
// or a lesson; lesson Q&A with instructor answers and accepted answers; announcements;
// reporting and moderation. Behind the `community` flag.
// Foreign reads (docs/03 §3): courses, course_revisions, course_staff, instructor_profiles,
// enrollments, cohorts, lessons, user.

const {
  threads,
  posts,
  reactions,
  reports,
  threadReads,
  courses,
  courseRevisions,
  courseStaff,
  instructorProfiles,
  enrollments,
  cohorts,
  lessons,
  user,
} = schema

export type ScopeType = 'course' | 'cohort' | 'lesson'
export type ThreadKind = 'discussion' | 'question' | 'announcement'

// ─── Who's looking ───────────────────────────────────────────────────────────────────────────

export interface Viewer {
  userId: string
  createdAt: Date
  /** learner: enrolled; teacher: the instructor, a co-instructor or a TA; staff: support+. */
  kind: 'learner' | 'teacher' | 'staff'
  canAnnounce: boolean
  canModerate: boolean
  /** The learner's cohort run in this course, if any. */
  cohortId: string | null
}

async function viewerFor(ctx: Ctx, courseId: string): Promise<Viewer | null> {
  const me = requireUser(ctx.actor)
  const [row] = await ctx.db
    .select({
      instructorId: courses.instructorId,
      staffRole: courseStaff.role,
      enrollmentStatus: enrollments.status,
      expires: enrollments.accessExpiresAt,
      cohortId: enrollments.cohortId,
      createdAt: user.createdAt,
    })
    .from(courses)
    .innerJoin(user, eq(user.id, me.userId))
    .leftJoin(
      courseStaff,
      and(eq(courseStaff.courseId, courses.id), eq(courseStaff.userId, me.userId)),
    )
    .leftJoin(
      enrollments,
      and(eq(enrollments.courseId, courses.id), eq(enrollments.userId, me.userId)),
    )
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
  if (!row) return null
  const staff = hasRole(me, 'support', 'admin', 'super_admin')
  const owner = row.instructorId === me.userId
  const teacher = owner || row.staffRole !== null
  const enrolled =
    (row.enrollmentStatus === 'active' || row.enrollmentStatus === 'completed') &&
    (row.expires === null || row.expires > ctx.now)
  if (!staff && !teacher && !enrolled) return null
  return {
    userId: me.userId,
    createdAt: row.createdAt,
    kind: teacher ? 'teacher' : staff ? 'staff' : 'learner',
    canAnnounce: owner || row.staffRole === 'co_instructor' || hasRole(me, 'admin', 'super_admin'),
    canModerate: teacher || staff,
    cohortId: enrolled ? row.cohortId : null,
  }
}

interface Scope {
  type: ScopeType
  id: string
  courseId: string
}

/** The course a scope belongs to, or NOT_FOUND. */
async function resolveScope(ctx: Ctx, type: ScopeType, id: string): Promise<Scope> {
  if (type === 'course') return { type, id, courseId: id }
  const [row] =
    type === 'cohort'
      ? await ctx.db.select({ courseId: cohorts.courseId }).from(cohorts).where(eq(cohorts.id, id))
      : await ctx.db
          .select({ courseId: lessons.courseId })
          .from(lessons)
          .where(and(eq(lessons.id, id), isNull(lessons.deletedAt)))
  if (!row) throw new NotFoundError(type === 'cohort' ? 'COHORT_NOT_FOUND' : 'LESSON_NOT_FOUND')
  return { type, id, courseId: row.courseId }
}

/** Cohort threads are for that run's learners (and the course's teachers and staff). */
const canSee = (v: Viewer, s: { type: ScopeType; id: string }) =>
  v.kind !== 'learner' || s.type !== 'cohort' || v.cohortId === s.id

async function requireEnabled(ctx: Ctx) {
  if (!(await isFeatureEnabled(ctx, 'community'))) throw new ForbiddenError('FEATURE_DISABLED')
}

/** A member of the course who may see the scope, or COURSE_NOT_FOUND (nothing leaks). */
async function member(ctx: Ctx, scope: Scope): Promise<Viewer> {
  await requireEnabled(ctx)
  const v = await viewerFor(ctx, scope.courseId)
  if (!v || !canSee(v, scope)) throw new NotFoundError('COURSE_NOT_FOUND')
  return v
}

// ─── Names ───────────────────────────────────────────────────────────────────────────────────

/** Learners appear as "Ada E."; the course's teachers by their public name. */
async function authorNames(ctx: Ctx, courseId: string, userIds: ReadonlyArray<string>) {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return new Map<string, { name: string; isTeacher: boolean }>()
  const [course] = await ctx.db
    .select({ instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, courseId))
  const rows = await ctx.db
    .select({
      id: user.id,
      name: user.name,
      displayName: instructorProfiles.displayName,
      staff: sql<boolean>`exists (select 1 from course_staff cs where cs.course_id = ${courseId} and cs.user_id = "user"."id")`,
    })
    .from(user)
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, user.id))
    .where(inArray(user.id, ids))
  return new Map(
    rows.map((r) => {
      const isTeacher = r.id === course?.instructorId || r.staff
      return [
        r.id,
        { name: isTeacher ? (r.displayName ?? r.name) : learnerDisplayName(r.name), isTeacher },
      ]
    }),
  )
}

// ─── Content ─────────────────────────────────────────────────────────────────────────────────

function checkContent(v: Viewer, title: string | null, body: RichTextDoc, now: Date) {
  const text = richTextToPlain(body)
  const issues: Array<{ path: string; message: string }> = []
  if (title !== null && (title.trim().length < TITLE_MIN || title.trim().length > TITLE_MAX)) {
    issues.push({ path: 'title', message: `Between ${TITLE_MIN} and ${TITLE_MAX} characters.` })
  }
  if (text.length === 0 || text.length > BODY_MAX) {
    issues.push({ path: 'body', message: `Write something, up to ${BODY_MAX} characters.` })
  }
  if (issues.length > 0) throw new RuleViolationError('VALIDATION_FAILED', { issues })
  // Teachers and staff aren't filtered: announcements often carry links.
  if (v.kind === 'learner') {
    const problem = contentProblem({
      text: `${title ?? ''} ${text}`,
      linkMarks: countLinkMarks(body),
      accountCreatedAt: v.createdAt,
      now,
    })
    if (problem) throw new RuleViolationError('CONTENT_REJECTED', { problem })
  }
  return { html: renderRichText(body), text }
}

// ─── Reading ─────────────────────────────────────────────────────────────────────────────────

export interface ThreadSummary {
  id: string
  kind: ThreadKind
  scopeType: ScopeType
  scopeId: string
  title: string
  excerpt: string
  author: { name: string; isTeacher: boolean }
  replyCount: number
  isPinned: boolean
  isLocked: boolean
  isHidden: boolean
  answered: boolean
  lastActivityAt: Date
  createdAt: Date
  unread: boolean
}

export type ThreadFilter = 'all' | 'questions' | 'unanswered' | 'announcements'
const PAGE = 30

/**
 * Threads in a course (or one scope of it), pinned first, then by latest activity. Learners see
 * the course, its lessons and their own cohort; hidden threads only reach moderators.
 */
export async function listThreads(
  ctx: Ctx,
  input: {
    courseId: string
    scope?: { type: ScopeType; id: string } | undefined
    filter?: ThreadFilter | undefined
    page?: number | undefined
  },
): Promise<{ items: ThreadSummary[]; hasMore: boolean; canAnnounce: boolean }> {
  const scope = input.scope
    ? await resolveScope(ctx, input.scope.type, input.scope.id)
    : { type: 'course' as const, id: input.courseId, courseId: input.courseId }
  if (scope.courseId !== input.courseId) throw new NotFoundError('COURSE_NOT_FOUND')
  const v = await member(ctx, scope)
  const filter = input.filter ?? 'all'
  const page = Math.max(0, Math.min(input.page ?? 0, 100))

  const inScope = input.scope
    ? and(eq(threads.scopeType, scope.type), eq(threads.scopeId, scope.id))
    : v.kind === 'learner'
      ? or(
          inArray(threads.scopeType, ['course', 'lesson']),
          v.cohortId
            ? and(eq(threads.scopeType, 'cohort'), eq(threads.scopeId, v.cohortId))
            : sql`false`,
        )
      : undefined
  const rows = await ctx.db
    .select({ t: threads, readAt: threadReads.lastReadAt })
    .from(threads)
    .leftJoin(
      threadReads,
      and(eq(threadReads.threadId, threads.id), eq(threadReads.userId, v.userId)),
    )
    .where(
      and(
        eq(threads.courseId, scope.courseId),
        isNull(threads.deletedAt),
        v.canModerate ? undefined : isNull(threads.hiddenAt),
        inScope,
        filter === 'questions' ? eq(threads.kind, 'question') : undefined,
        filter === 'unanswered'
          ? and(eq(threads.kind, 'question'), isNull(threads.answeredAt))
          : undefined,
        filter === 'announcements' ? eq(threads.kind, 'announcement') : undefined,
      ),
    )
    .orderBy(desc(threads.isPinned), desc(threads.lastActivityAt), desc(threads.id))
    .limit(PAGE + 1)
    .offset(page * PAGE)
  const names = await authorNames(
    ctx,
    scope.courseId,
    rows.map((r) => r.t.authorId),
  )
  return {
    items: rows.slice(0, PAGE).map(({ t, readAt }) => ({
      id: t.id,
      kind: t.kind,
      scopeType: t.scopeType,
      scopeId: t.scopeId,
      title: t.title,
      excerpt: excerpt(richTextToPlain(t.bodyDoc as RichTextDoc)),
      author: names.get(t.authorId) ?? { name: 'Former learner', isTeacher: false },
      replyCount: t.replyCount,
      isPinned: t.isPinned,
      isLocked: t.isLocked,
      isHidden: t.hiddenAt !== null,
      answered: t.answeredAt !== null,
      lastActivityAt: t.lastActivityAt,
      createdAt: t.createdAt,
      unread: t.authorId !== v.userId && (readAt === null || readAt < t.lastActivityAt),
    })),
    hasMore: rows.length > PAGE,
    canAnnounce: v.canAnnounce,
  }
}

export interface PostView {
  id: string
  parentId: string | null
  author: { name: string; isTeacher: boolean }
  bodyHtml: string
  isInstructorAnswer: boolean
  isAccepted: boolean
  isHidden: boolean
  mine: boolean
  likes: number
  likedByMe: boolean
  createdAt: Date
}

export interface ThreadDetail extends Omit<ThreadSummary, 'unread' | 'excerpt'> {
  courseId: string
  bodyHtml: string
  mine: boolean
  posts: PostView[]
  can: { reply: boolean; accept: boolean; moderate: boolean }
}

async function visibleThread(ctx: Ctx, threadId: string) {
  const [t] = await ctx.db
    .select()
    .from(threads)
    .where(and(eq(threads.id, threadId), isNull(threads.deletedAt)))
  if (!t) throw new NotFoundError('THREAD_NOT_FOUND')
  const v = await member(ctx, { type: t.scopeType, id: t.scopeId, courseId: t.courseId }).catch(
    () => {
      throw new NotFoundError('THREAD_NOT_FOUND')
    },
  )
  if (t.hiddenAt && !v.canModerate) throw new NotFoundError('THREAD_NOT_FOUND')
  return { t, v }
}

/** A thread with its replies; opening it marks it read. */
export async function getThread(ctx: Ctx, threadId: string): Promise<ThreadDetail> {
  const { t, v } = await visibleThread(ctx, threadId)
  const rows = await ctx.db
    .select({
      p: posts,
      likes: sql<number>`(select count(*)::int from reactions r where r.post_id = ${posts.id})`,
      mine: sql<boolean>`exists (select 1 from reactions r where r.post_id = ${posts.id} and r.user_id = ${v.userId})`,
    })
    .from(posts)
    .where(
      and(
        eq(posts.threadId, t.id),
        isNull(posts.deletedAt),
        v.canModerate ? undefined : isNull(posts.hiddenAt),
      ),
    )
    .orderBy(asc(posts.createdAt), asc(posts.id))
    .limit(500)
  const names = await authorNames(ctx, t.courseId, [t.authorId, ...rows.map((r) => r.p.authorId)])
  await ctx.db
    .insert(threadReads)
    .values({ userId: v.userId, threadId: t.id, lastReadAt: ctx.now })
    .onConflictDoUpdate({
      target: [threadReads.userId, threadReads.threadId],
      set: { lastReadAt: ctx.now },
    })
  const anon = { name: 'Former learner', isTeacher: false }
  return {
    id: t.id,
    courseId: t.courseId,
    kind: t.kind,
    scopeType: t.scopeType,
    scopeId: t.scopeId,
    title: t.title,
    bodyHtml: t.bodyHtml,
    author: names.get(t.authorId) ?? anon,
    mine: t.authorId === v.userId,
    replyCount: t.replyCount,
    isPinned: t.isPinned,
    isLocked: t.isLocked,
    isHidden: t.hiddenAt !== null,
    answered: t.answeredAt !== null,
    lastActivityAt: t.lastActivityAt,
    createdAt: t.createdAt,
    posts: rows.map(({ p, likes, mine }) => ({
      id: p.id,
      parentId: p.parentId,
      author: names.get(p.authorId) ?? anon,
      bodyHtml: p.bodyHtml,
      isInstructorAnswer: p.isInstructorAnswer,
      isAccepted: t.acceptedPostId === p.id,
      isHidden: p.hiddenAt !== null,
      mine: p.authorId === v.userId,
      likes,
      likedByMe: mine,
      createdAt: p.createdAt,
    })),
    can: {
      reply: !t.isLocked || v.canModerate,
      accept: t.kind === 'question' && (t.authorId === v.userId || v.kind === 'teacher'),
      moderate: v.canModerate,
    },
  }
}

// ─── Writing ─────────────────────────────────────────────────────────────────────────────────

/** Starts a thread. Announcements: the instructor or a co-instructor, to the course or a cohort. */
export async function createThread(
  ctx: Ctx,
  input: {
    scopeType: ScopeType
    scopeId: string
    kind: ThreadKind
    title: string
    body: RichTextDoc
  },
): Promise<ThreadDetail> {
  const scope = await resolveScope(ctx, input.scopeType, input.scopeId)
  const v = await member(ctx, scope)
  if (input.kind === 'announcement') {
    if (!v.canAnnounce) throw new ForbiddenError('NOT_COURSE_OWNER')
    if (scope.type === 'lesson') {
      throw new RuleViolationError('VALIDATION_FAILED', {
        issues: [{ path: 'scopeType', message: 'Announcements go to the course or a cohort.' }],
      })
    }
  }
  const { html, text } = checkContent(v, input.title, input.body, ctx.now)
  const id = await inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(threads)
      .values({
        courseId: scope.courseId,
        scopeType: scope.type,
        scopeId: scope.id,
        kind: input.kind,
        authorId: v.userId,
        title: input.title.trim(),
        bodyDoc: input.body as unknown as Record<string, unknown>,
        bodyHtml: html,
        lastActivityAt: tx.now,
      })
      .returning({ id: threads.id })
    if (!row) throw new Error('thread not inserted')
    await tx.db
      .insert(threadReads)
      .values({ userId: v.userId, threadId: row.id, lastReadAt: tx.now })
    if (input.kind === 'announcement') {
      await tx.events.emit('announcement.posted', { threadId: row.id, courseId: scope.courseId })
    }
    await notifyMentions(tx, {
      courseId: scope.courseId,
      scope,
      threadId: row.id,
      threadTitle: input.title.trim(),
      authorId: v.userId,
      text,
    })
    return row.id
  })
  if (input.kind === 'question') {
    void track(ctx, 'question_asked', { course_id: scope.courseId })
  }
  return getThread(ctx, id)
}

/** Replies to a thread (or to a reply in it). Teachers' replies to questions count as answers. */
export async function reply(
  ctx: Ctx,
  input: { threadId: string; body: RichTextDoc; parentId?: string | null | undefined },
): Promise<ThreadDetail> {
  const { t, v } = await visibleThread(ctx, input.threadId)
  if (t.isLocked && !v.canModerate) throw new RuleViolationError('THREAD_LOCKED')
  const { html, text } = checkContent(v, null, input.body, ctx.now)
  const teacherAnswer = v.kind === 'teacher'
  await inTransaction(ctx, async (tx) => {
    let parentAuthor: string | null = null
    if (input.parentId) {
      const [parent] = await tx.db
        .select({ authorId: posts.authorId })
        .from(posts)
        .where(and(eq(posts.id, input.parentId), eq(posts.threadId, t.id)))
      if (!parent) throw new NotFoundError('THREAD_NOT_FOUND')
      parentAuthor = parent.authorId
    }
    const [row] = await tx.db
      .insert(posts)
      .values({
        threadId: t.id,
        authorId: v.userId,
        parentId: input.parentId ?? null,
        bodyDoc: input.body as unknown as Record<string, unknown>,
        bodyHtml: html,
        isInstructorAnswer: teacherAnswer,
      })
      .returning({ id: posts.id })
    if (!row) throw new Error('post not inserted')
    await tx.db
      .update(threads)
      .set({
        replyCount: sql`${threads.replyCount} + 1`,
        lastActivityAt: tx.now,
        ...(t.kind === 'question' && teacherAnswer && !t.answeredAt ? { answeredAt: tx.now } : {}),
      })
      .where(eq(threads.id, t.id))
    await tx.db
      .insert(threadReads)
      .values({ userId: v.userId, threadId: t.id, lastReadAt: tx.now })
      .onConflictDoUpdate({
        target: [threadReads.userId, threadReads.threadId],
        set: { lastReadAt: tx.now },
      })
    const scope = { type: t.scopeType, id: t.scopeId, courseId: t.courseId }
    const told = await notifyReply(tx, {
      courseId: t.courseId,
      threadId: t.id,
      threadTitle: t.title,
      replierId: v.userId,
      recipients: [t.authorId, ...(parentAuthor ? [parentAuthor] : [])],
      isAnswer: t.kind === 'question' && teacherAnswer,
      text,
    })
    await notifyMentions(tx, {
      courseId: t.courseId,
      scope,
      threadId: t.id,
      threadTitle: t.title,
      authorId: v.userId,
      text,
      skip: told,
    })
  })
  return getThread(ctx, t.id)
}

/** Likes or un-likes a reply. */
export async function react(
  ctx: Ctx,
  input: { postId: string; on: boolean },
): Promise<{ likes: number; likedByMe: boolean }> {
  const [p] = await ctx.db
    .select({ threadId: posts.threadId })
    .from(posts)
    .where(and(eq(posts.id, input.postId), isNull(posts.deletedAt)))
  if (!p) throw new NotFoundError('THREAD_NOT_FOUND')
  const { v } = await visibleThread(ctx, p.threadId)
  if (input.on) {
    await ctx.db
      .insert(reactions)
      .values({ postId: input.postId, userId: v.userId, kind: 'like' })
      .onConflictDoNothing()
  } else {
    await ctx.db
      .delete(reactions)
      .where(and(eq(reactions.postId, input.postId), eq(reactions.userId, v.userId)))
  }
  const [c] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(reactions)
    .where(eq(reactions.postId, input.postId))
  return { likes: c?.n ?? 0, likedByMe: input.on }
}

/** The asker (or a teacher) marks the reply that answered the question; null clears it. */
export async function acceptAnswer(
  ctx: Ctx,
  input: { threadId: string; postId: string | null },
): Promise<ThreadDetail> {
  const { t, v } = await visibleThread(ctx, input.threadId)
  if (t.kind !== 'question' || (t.authorId !== v.userId && v.kind !== 'teacher')) {
    throw new ForbiddenError('FORBIDDEN')
  }
  if (input.postId) {
    const [p] = await ctx.db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.id, input.postId), eq(posts.threadId, t.id), isNull(posts.deletedAt)))
    if (!p) throw new NotFoundError('THREAD_NOT_FOUND')
  }
  await ctx.db
    .update(threads)
    .set({
      acceptedPostId: input.postId,
      ...(input.postId && !t.answeredAt ? { answeredAt: ctx.now } : {}),
    })
    .where(eq(threads.id, t.id))
  if (input.postId) void track(ctx, 'answer_accepted', { course_id: t.courseId })
  return getThread(ctx, t.id)
}

/** Removes the viewer's own thread or reply (soft delete). */
export async function deleteOwn(
  ctx: Ctx,
  input: { targetType: 'thread' | 'post'; targetId: string },
): Promise<void> {
  const me = requireUser(ctx.actor)
  if (input.targetType === 'thread') {
    const { t } = await visibleThread(ctx, input.targetId)
    if (t.authorId !== me.userId) throw new ForbiddenError('FORBIDDEN')
    await ctx.db.update(threads).set({ deletedAt: ctx.now }).where(eq(threads.id, t.id))
    return
  }
  const [p] = await ctx.db
    .select()
    .from(posts)
    .where(and(eq(posts.id, input.targetId), isNull(posts.deletedAt)))
  if (!p) throw new NotFoundError('THREAD_NOT_FOUND')
  await visibleThread(ctx, p.threadId)
  if (p.authorId !== me.userId) throw new ForbiddenError('FORBIDDEN')
  await inTransaction(ctx, async (tx) => {
    await tx.db.update(posts).set({ deletedAt: tx.now }).where(eq(posts.id, p.id))
    await tx.db
      .update(threads)
      .set({
        replyCount: sql`greatest(${threads.replyCount} - 1, 0)`,
        // An accepted answer that is withdrawn stops being the answer.
        acceptedPostId: sql`case when ${threads.acceptedPostId} = ${p.id} then null else ${threads.acceptedPostId} end`,
      })
      .where(eq(threads.id, p.threadId))
  })
}

// ─── Moderation ──────────────────────────────────────────────────────────────────────────────

/** Anyone who can see it can report a thread or reply once; staff work the queue. */
export async function report(
  ctx: Ctx,
  input: { targetType: 'thread' | 'post'; targetId: string; reason: string },
): Promise<void> {
  const threadId =
    input.targetType === 'thread'
      ? input.targetId
      : (
          await ctx.db
            .select({ threadId: posts.threadId })
            .from(posts)
            .where(eq(posts.id, input.targetId))
        )[0]?.threadId
  if (!threadId) throw new NotFoundError('THREAD_NOT_FOUND')
  const { t, v } = await visibleThread(ctx, threadId)
  await ctx.db
    .insert(reports)
    .values({
      targetType: input.targetType,
      targetId: input.targetId,
      courseId: t.courseId,
      reporterId: v.userId,
      reason: input.reason.trim().slice(0, 500),
    })
    .onConflictDoNothing()
}

export type ModerationAction = 'hide' | 'unhide' | 'lock' | 'unlock' | 'pin' | 'unpin'

/** The course's teachers moderate their course; staff moderate everywhere. Audit-logged. */
export async function moderate(
  ctx: Ctx,
  input: { targetType: 'thread' | 'post'; targetId: string; action: ModerationAction },
): Promise<void> {
  const threadId =
    input.targetType === 'thread'
      ? input.targetId
      : (
          await ctx.db
            .select({ threadId: posts.threadId })
            .from(posts)
            .where(eq(posts.id, input.targetId))
        )[0]?.threadId
  if (!threadId) throw new NotFoundError('THREAD_NOT_FOUND')
  const { t, v } = await visibleThread(ctx, threadId)
  if (!v.canModerate) throw new ForbiddenError('FORBIDDEN')
  const threadOnly = ['lock', 'unlock', 'pin', 'unpin'].includes(input.action)
  if (threadOnly && input.targetType !== 'thread') {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'action', message: 'Only whole discussions can be locked or pinned.' }],
    })
  }
  await inTransaction(ctx, async (tx) => {
    const visibility =
      input.action === 'hide'
        ? { hiddenAt: tx.now, hiddenBy: v.userId }
        : input.action === 'unhide'
          ? { hiddenAt: null, hiddenBy: null }
          : null
    if (input.targetType === 'post') {
      if (visibility) {
        await tx.db.update(posts).set(visibility).where(eq(posts.id, input.targetId))
      }
    } else {
      await tx.db
        .update(threads)
        .set(
          visibility ??
            (input.action === 'lock' || input.action === 'unlock'
              ? { isLocked: input.action === 'lock' }
              : { isPinned: input.action === 'pin' }),
        )
        .where(eq(threads.id, input.targetId))
    }
    // Hiding settles the reports about it.
    if (input.action === 'hide') {
      await tx.db
        .update(reports)
        .set({ status: 'resolved', handledBy: v.userId, handledAt: tx.now })
        .where(
          and(
            eq(reports.targetType, input.targetType),
            eq(reports.targetId, input.targetId),
            eq(reports.status, 'open'),
          ),
        )
    }
    await writeAudit(tx, {
      action: `community.${input.action}`,
      targetType: input.targetType,
      targetId: input.targetId,
      after: { courseId: t.courseId },
    })
  })
}

export interface ReportView {
  id: string
  targetType: 'thread' | 'post'
  targetId: string
  threadId: string
  courseTitle: string
  courseSlug: string
  excerpt: string
  authorName: string
  reason: string
  reports: number
  createdAt: Date
}

/** Staff queue (docs/20 `/admin/moderation`): open reports, one row per reported thing. */
export async function listOpenReports(ctx: Ctx): Promise<ReportView[]> {
  const me = requireUser(ctx.actor)
  if (!hasRole(me, 'support', 'admin', 'super_admin')) throw new ForbiddenError('STAFF_ONLY')
  const rows = await ctx.db
    .select({
      targetType: reports.targetType,
      targetId: reports.targetId,
      id: sql<string>`(array_agg(${reports.id} order by ${reports.createdAt}))[1]`,
      reason: sql<string>`(array_agg(${reports.reason} order by ${reports.createdAt}))[1]`,
      n: sql<number>`count(*)::int`,
      first: sql<Date>`min(${reports.createdAt})`.mapWith(reports.createdAt),
      courseId: reports.courseId,
    })
    .from(reports)
    .where(eq(reports.status, 'open'))
    .groupBy(reports.targetType, reports.targetId, reports.courseId)
    .orderBy(sql`min(${reports.createdAt})`)
    .limit(100)
  const out: ReportView[] = []
  for (const r of rows) {
    const [target] =
      r.targetType === 'thread'
        ? await ctx.db
            .select({ threadId: threads.id, doc: threads.bodyDoc, authorId: threads.authorId })
            .from(threads)
            .where(eq(threads.id, r.targetId))
        : await ctx.db
            .select({ threadId: posts.threadId, doc: posts.bodyDoc, authorId: posts.authorId })
            .from(posts)
            .where(eq(posts.id, r.targetId))
    const [course] = await ctx.db
      .select({ slug: courses.slug, title: courseRevisions.title })
      .from(courses)
      .innerJoin(courseRevisions, eq(courseRevisions.id, courses.liveRevisionId))
      .where(eq(courses.id, r.courseId))
    if (!target || !course) continue
    const names = await authorNames(ctx, r.courseId, [target.authorId])
    out.push({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      threadId: target.threadId,
      courseTitle: course.title,
      courseSlug: course.slug,
      excerpt: excerpt(richTextToPlain(target.doc as RichTextDoc), 240),
      authorName: names.get(target.authorId)?.name ?? 'Former learner',
      reason: r.reason,
      reports: r.n,
      createdAt: r.first,
    })
  }
  return out
}

/** Staff: hide the reported thing (resolves its reports) or dismiss the reports. */
export async function handleReport(
  ctx: Ctx,
  input: { reportId: string; action: 'hide' | 'dismiss' },
): Promise<void> {
  const me = requireUser(ctx.actor)
  if (!hasRole(me, 'support', 'admin', 'super_admin')) throw new ForbiddenError('STAFF_ONLY')
  const [r] = await ctx.db.select().from(reports).where(eq(reports.id, input.reportId))
  if (!r) throw new NotFoundError('THREAD_NOT_FOUND')
  if (input.action === 'hide') {
    await moderate(ctx, { targetType: r.targetType, targetId: r.targetId, action: 'hide' })
    return
  }
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .update(reports)
      .set({ status: 'dismissed', handledBy: me.userId, handledAt: tx.now })
      .where(
        and(
          eq(reports.targetType, r.targetType),
          eq(reports.targetId, r.targetId),
          eq(reports.status, 'open'),
        ),
      )
    await writeAudit(tx, {
      action: 'community.report_dismissed',
      targetType: r.targetType,
      targetId: r.targetId,
    })
  })
}

// ─── Teachers ────────────────────────────────────────────────────────────────────────────────

export interface UnansweredQuestion {
  threadId: string
  courseId: string
  courseTitle: string
  courseSlug: string
  title: string
  excerpt: string
  askerName: string
  lessonTitle: string | null
  createdAt: Date
}

/** `/teach/qa`: questions nobody on the teaching side has answered, oldest first. */
export async function unansweredQuestions(ctx: Ctx): Promise<UnansweredQuestion[]> {
  const me = requireUser(ctx.actor)
  await requireEnabled(ctx)
  const rows = await ctx.db
    .select({
      t: threads,
      courseSlug: courses.slug,
      courseTitle: courseRevisions.title,
      lessonTitle: lessons.title,
    })
    .from(threads)
    .innerJoin(courses, eq(courses.id, threads.courseId))
    .innerJoin(courseRevisions, eq(courseRevisions.id, courses.liveRevisionId))
    .leftJoin(
      lessons,
      and(eq(threads.scopeType, 'lesson'), sql`${lessons.id} = ${threads.scopeId}`),
    )
    .where(
      and(
        eq(threads.kind, 'question'),
        isNull(threads.answeredAt),
        isNull(threads.deletedAt),
        isNull(threads.hiddenAt),
        or(
          eq(courses.instructorId, me.userId),
          sql`exists (select 1 from course_staff cs where cs.course_id = ${threads.courseId} and cs.user_id = ${me.userId})`,
        ),
      ),
    )
    .orderBy(asc(threads.createdAt))
    .limit(50)
  const byCourse = new Map<string, string[]>()
  for (const r of rows)
    byCourse.set(r.t.courseId, [...(byCourse.get(r.t.courseId) ?? []), r.t.authorId])
  const names = new Map<string, string>()
  for (const [courseId, ids] of byCourse) {
    for (const [id, n] of await authorNames(ctx, courseId, ids)) names.set(id, n.name)
  }
  return rows.map((r) => ({
    threadId: r.t.id,
    courseId: r.t.courseId,
    courseTitle: r.courseTitle,
    courseSlug: r.courseSlug,
    title: r.t.title,
    excerpt: excerpt(richTextToPlain(r.t.bodyDoc as RichTextDoc)),
    askerName: names.get(r.t.authorId) ?? 'Former learner',
    lessonTitle: r.lessonTitle,
    createdAt: r.t.createdAt,
  }))
}

// ─── Emails ──────────────────────────────────────────────────────────────────────────────────

const hourKey = (ctx: Ctx) => Math.floor(ctx.now.getTime() / 3_600_000)

async function courseFacts(ctx: Ctx, courseId: string) {
  const [c] = await ctx.db
    .select({ slug: courses.slug, title: courseRevisions.title })
    .from(courses)
    .innerJoin(courseRevisions, eq(courseRevisions.id, courses.liveRevisionId))
    .where(eq(courses.id, courseId))
  return c ?? null
}

const threadPath = (slug: string, threadId: string) => `/learn/${slug}/community/${threadId}`
const threadUrl = (ctx: Ctx, slug: string, threadId: string) =>
  `${provider(ctx, 'urls').app.replace(/\/$/, '')}${threadPath(slug, threadId)}`

/**
 * Replies to people's threads: an in-app notification each, and at most one email per person per
 * thread per hour (the idempotency key carries the hour); busy hours fold into the digest.
 * Returns who was emailed, so a mention doesn't email them twice.
 */
async function notifyReply(
  tx: Ctx,
  input: {
    courseId: string
    threadId: string
    threadTitle: string
    replierId: string
    recipients: string[]
    isAnswer: boolean
    text: string
  },
): Promise<Set<string>> {
  const to = [...new Set(input.recipients)].filter((id) => id !== input.replierId)
  if (to.length === 0) return new Set()
  const course = await courseFacts(tx, input.courseId)
  if (!course) return new Set()
  const [people, names] = await Promise.all([
    tx.db
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(inArray(user.id, to)),
    authorNames(tx, input.courseId, [input.replierId]),
  ])
  const replier = names.get(input.replierId)?.name ?? 'Someone'
  await notifyMany(
    tx,
    people.map((p) => ({
      userId: p.id,
      type: input.isAnswer ? 'qa.answered' : 'thread.reply',
      title: input.isAnswer
        ? `${replier} answered “${input.threadTitle}”`
        : `${replier} replied to “${input.threadTitle}”`,
      body: excerpt(input.text, 140),
      link: threadPath(course.slug, input.threadId),
      email: {
        id: 'thread-reply',
        businessKey: `${input.threadId}:${p.id}:${hourKey(tx)}`,
        data: {
          name: p.name.split(/\s+/)[0] ?? p.name,
          courseTitle: course.title,
          threadTitle: input.threadTitle,
          replierName: replier,
          excerpt: excerpt(input.text, 200),
          isAnswer: input.isAnswer,
          url: threadUrl(tx, course.slug, input.threadId),
        },
      },
    })),
  )
  return new Set(people.map((p) => p.id))
}

/** `@username` mentions of people who can see the thread. */
async function notifyMentions(
  tx: Ctx,
  input: {
    courseId: string
    scope: Scope
    threadId: string
    threadTitle: string
    authorId: string
    text: string
    skip?: Set<string>
  },
): Promise<void> {
  const handles = mentionedUsernames(input.text)
  if (handles.length === 0) return
  // Only people who can open the thread: the course's (or that cohort's) learners, its teachers.
  // Literal outer column: Drizzle leaves single-table columns unqualified.
  const found = await tx.db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(
      and(
        inArray(sql`lower(${user.username})`, handles),
        sql`(exists (
          select 1 from enrollments e where e.user_id = "user"."id" and e.course_id = ${input.courseId}
            and e.status in ('active', 'completed')
            and (${input.scope.type} <> 'cohort' or e.cohort_id = ${input.scope.id})
        ) or exists (select 1 from courses c where c.id = ${input.courseId} and c.instructor_id = "user"."id")
          or exists (select 1 from course_staff cs where cs.course_id = ${input.courseId} and cs.user_id = "user"."id"))`,
      ),
    )
  if (found.length === 0) return
  const course = await courseFacts(tx, input.courseId)
  if (!course) return
  const names = await authorNames(tx, input.courseId, [input.authorId])
  const author = names.get(input.authorId)?.name ?? 'Someone'
  await notifyMany(
    tx,
    found
      .filter((p) => p.id !== input.authorId && !input.skip?.has(p.id))
      .map((p) => ({
        userId: p.id,
        type: 'mention' as const,
        title: `${author} mentioned you in “${input.threadTitle}”`,
        body: excerpt(input.text, 140),
        link: threadPath(course.slug, input.threadId),
        email: {
          id: 'mention' as const,
          businessKey: `${input.threadId}:${p.id}:${hourKey(tx)}`,
          data: {
            name: p.name.split(/\s+/)[0] ?? p.name,
            courseTitle: course.title,
            threadTitle: input.threadTitle,
            authorName: author,
            excerpt: excerpt(input.text, 200),
            url: threadUrl(tx, course.slug, input.threadId),
          },
        },
      })),
  )
}

const ANNOUNCE_PAGE = 500

/**
 * The `announcement-send` job: emails an announcement to the course's learners (or the cohort's),
 * a page at a time by user id. Returns where to continue; the idempotency key makes re-runs safe.
 */
export async function sendAnnouncementEmails(
  ctx: Ctx,
  input: { threadId: string; afterUserId: string | null },
): Promise<{ sent: number; lastUserId: string | null; done: boolean }> {
  const [t] = await ctx.db
    .select()
    .from(threads)
    .where(and(eq(threads.id, input.threadId), eq(threads.kind, 'announcement')))
  if (!t || t.deletedAt || t.hiddenAt) return { sent: 0, lastUserId: null, done: true }
  const course = await courseFacts(ctx, t.courseId)
  if (!course) return { sent: 0, lastUserId: null, done: true }
  const [author, cohort] = await Promise.all([
    authorNames(ctx, t.courseId, [t.authorId]),
    t.scopeType === 'cohort'
      ? ctx.db.select({ name: cohorts.name }).from(cohorts).where(eq(cohorts.id, t.scopeId))
      : Promise.resolve([]),
  ])
  const learners = await ctx.db
    .select({ id: user.id, email: user.email })
    .from(enrollments)
    .innerJoin(user, eq(user.id, enrollments.userId))
    .where(
      and(
        eq(enrollments.courseId, t.courseId),
        inArray(enrollments.status, ['active', 'completed']),
        t.scopeType === 'cohort' ? eq(enrollments.cohortId, t.scopeId) : undefined,
        input.afterUserId ? gt(user.id, input.afterUserId) : undefined,
      ),
    )
    .orderBy(asc(user.id))
    .limit(ANNOUNCE_PAGE)
  const body = richTextToPlain(t.bodyDoc as RichTextDoc).slice(0, 2000)
  const instructorName = author.get(t.authorId)?.name ?? course.title
  await notifyMany(
    ctx,
    learners.map((l) => ({
      userId: l.id,
      type: 'announcement' as const,
      title: `${course.title}: ${t.title}`,
      body: excerpt(body, 140),
      link: threadPath(course.slug, t.id),
      dedupeKey: `announcement:${t.id}`,
      email: {
        id: 'announcement' as const,
        businessKey: `${t.id}:${l.id}`,
        data: {
          courseTitle: course.title,
          instructorName,
          cohortName: cohort[0]?.name ?? null,
          title: t.title,
          body,
          url: threadUrl(ctx, course.slug, t.id),
        },
      },
    })),
  )
  return {
    sent: learners.length,
    lastUserId: learners[learners.length - 1]?.id ?? null,
    done: learners.length < ANNOUNCE_PAGE,
  }
}
