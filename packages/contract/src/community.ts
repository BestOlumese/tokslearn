import { z } from 'zod'
import { base } from './base'
import { RichTextDoc } from './rich-text'
import { IsoDateTime } from './shared'

// Phase 8 community procedures (docs/06 §5, docs/10 §10, docs/20 Phase 8 rows): threads and
// replies in a course, cohort or lesson; Q&A; announcements; reports and moderation. Bodies go
// in as editor JSON and come back as HTML rendered on the server from an allowlist.

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: [tag], summary, description })
const post = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: [tag], summary, description })

export const ScopeType = z.enum(['course', 'cohort', 'lesson'])
export const ThreadKind = z.enum(['discussion', 'question', 'announcement'])
export const ThreadFilter = z.enum(['all', 'questions', 'unanswered', 'announcements'])
const Target = z.enum(['thread', 'post'])
const Author = z.object({ name: z.string(), isTeacher: z.boolean() })
const ok = z.object({ ok: z.literal(true) })

const ThreadSummaryShape = z.object({
  id: z.uuid(),
  kind: ThreadKind,
  scopeType: ScopeType,
  scopeId: z.uuid(),
  title: z.string(),
  excerpt: z.string(),
  author: Author,
  replyCount: z.number().int(),
  isPinned: z.boolean(),
  isLocked: z.boolean(),
  isHidden: z.boolean(),
  answered: z.boolean(),
  lastActivityAt: IsoDateTime,
  createdAt: IsoDateTime,
  unread: z.boolean(),
})
export type ThreadSummaryDto = z.infer<typeof ThreadSummaryShape>
export const ThreadSummaryDto = named(ThreadSummaryShape)

const PostShape = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  author: Author,
  bodyHtml: z.string(),
  isInstructorAnswer: z.boolean(),
  isAccepted: z.boolean(),
  isHidden: z.boolean(),
  mine: z.boolean(),
  likes: z.number().int(),
  likedByMe: z.boolean(),
  createdAt: IsoDateTime,
})

const ThreadShape = ThreadSummaryShape.omit({ unread: true, excerpt: true }).extend({
  courseId: z.uuid(),
  bodyHtml: z.string(),
  mine: z.boolean(),
  posts: z.array(PostShape),
  can: z.object({ reply: z.boolean(), accept: z.boolean(), moderate: z.boolean() }),
})
export type ThreadDto = z.infer<typeof ThreadShape>
export const ThreadDto = named(ThreadShape)

const UnansweredShape = z.object({
  threadId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  askerName: z.string(),
  lessonTitle: z.string().nullable(),
  createdAt: IsoDateTime,
})
export type UnansweredQuestionDto = z.infer<typeof UnansweredShape>
export const UnansweredQuestionDto = named(UnansweredShape)

const ReportShape = z.object({
  id: z.uuid(),
  targetType: Target,
  targetId: z.uuid(),
  threadId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  excerpt: z.string(),
  authorName: z.string(),
  reason: z.string(),
  reports: z.number().int(),
  createdAt: IsoDateTime,
})
export type ReportDto = z.infer<typeof ReportShape>
export const ReportDto = named(ReportShape)

export const communityContract = {
  listThreads: get(
    '/courses/{courseId}/threads',
    'Community',
    'Discussions',
    'Pinned first, then latest activity. Learners see the course, its lessons and their own cohort. 30 per page.',
  )
    .input(
      z.object({
        courseId: z.uuid(),
        scopeType: ScopeType.optional(),
        scopeId: z.uuid().optional(),
        filter: ThreadFilter.optional(),
        page: z.coerce.number().int().min(0).max(100).optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(ThreadSummaryDto),
        hasMore: z.boolean(),
        canAnnounce: z.boolean(),
      }),
    ),
  getThread: get(
    '/threads/{threadId}',
    'Community',
    'A discussion',
    'The thread and its replies. Opening it marks it read.',
  )
    .input(z.object({ threadId: z.uuid() }))
    .output(ThreadDto),
  createThread: post(
    '/threads',
    'Community',
    'Start a discussion',
    'A discussion or question in a course, cohort or lesson; an announcement (instructors) in a course or cohort. CONTENT_REJECTED when the filter catches it.',
  )
    .input(
      z.strictObject({
        scopeType: ScopeType,
        scopeId: z.uuid(),
        kind: ThreadKind,
        title: z.string().trim().min(5).max(150),
        body: RichTextDoc,
      }),
    )
    .output(ThreadDto),
  reply: post(
    '/threads/{threadId}/replies',
    'Community',
    'Reply',
    'THREAD_LOCKED on a closed discussion. A teacher’s reply to a question is the instructor answer.',
  )
    .input(
      z.strictObject({
        threadId: z.uuid(),
        body: RichTextDoc,
        parentId: z.uuid().nullable().optional(),
      }),
    )
    .output(ThreadDto),
  react: post('/posts/{postId}/like', 'Community', 'Like a reply', 'On or off.')
    .input(z.strictObject({ postId: z.uuid(), on: z.boolean() }))
    .output(z.object({ likes: z.number().int(), likedByMe: z.boolean() })),
  acceptAnswer: post(
    '/threads/{threadId}/accept',
    'Community',
    'Accept an answer',
    'The asker (or a teacher) marks the reply that answered the question; null clears it.',
  )
    .input(z.strictObject({ threadId: z.uuid(), postId: z.uuid().nullable() }))
    .output(ThreadDto),
  deleteOwn: post(
    '/community/delete',
    'Community',
    'Delete my post',
    'Your own discussion or reply.',
  )
    .input(z.strictObject({ targetType: Target, targetId: z.uuid() }))
    .output(ok),
  report: post(
    '/community/report',
    'Community',
    'Report a post',
    'Once per person per post. Tokslearn staff review reports.',
  )
    .input(
      z.strictObject({
        targetType: Target,
        targetId: z.uuid(),
        reason: z.string().trim().min(3).max(500),
      }),
    )
    .output(ok),
  moderate: post(
    '/community/moderate',
    'Community',
    'Moderate',
    'Hide or show a post; lock, unlock, pin or unpin a discussion. The course’s teachers and staff.',
  )
    .input(
      z.strictObject({
        targetType: Target,
        targetId: z.uuid(),
        action: z.enum(['hide', 'unhide', 'lock', 'unlock', 'pin', 'unpin']),
      }),
    )
    .output(ok),
  unanswered: get(
    '/teach/questions',
    'Studio',
    'Unanswered questions',
    'Questions in the courses you teach that no teacher has answered, oldest first.',
  ).output(z.object({ items: z.array(UnansweredQuestionDto) })),
}

export const adminModerationContract = {
  reports: get(
    '/admin/reports',
    'Admin',
    'Reports',
    'Open reports, one row per reported post, oldest first. Support staff and above.',
  ).output(z.object({ items: z.array(ReportDto) })),
  handle: post(
    '/admin/reports/{reportId}',
    'Admin',
    'Handle a report',
    'Hide the post (resolves its reports) or dismiss the reports.',
  )
    .input(z.strictObject({ reportId: z.uuid(), action: z.enum(['hide', 'dismiss']) }))
    .output(ok),
}
