import { z } from 'zod'
import { base } from './base'
import { Cursor, IsoDateTime } from './shared'
import { LessonType } from './studio'

// The course player, progress, notes, bookmarks, streaks and badges (docs/06 §5, docs/10 §2–4,
// docs/20 Phase 5 rows). Progress is never trusted as sent: the server clamps every beat.

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: [tag], summary, description })
const post = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: [tag], summary, description })

export const ProgressStatus = z.enum(['not_started', 'in_progress', 'completed'])
const Seconds = z.number().int().min(0).max(86_400)
/** A moment in a video, as the player reports it (fractions allowed; stored as whole seconds). */
const Moment = z.number().min(0).max(86_400)

const OutlineLessonShape = z.object({
  id: z.uuid(),
  title: z.string(),
  type: LessonType,
  durationSec: z.number().int(),
  isPreview: z.boolean(),
  status: ProgressStatus,
  locked: z.boolean(),
  unlocksAt: IsoDateTime.nullable(),
})

const LearnOutlineShape = z.object({
  course: z.object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    instructorName: z.string(),
    coverUrl: z.string().nullable(),
    completionThresholdPct: z.number().int(),
  }),
  role: z.enum(['learner', 'teaching']),
  progressPct: z.number().int(),
  sections: z.array(
    z.object({ id: z.uuid(), title: z.string(), lessons: z.array(OutlineLessonShape) }),
  ),
  nextLessonId: z.uuid().nullable(),
})
export type LearnOutlineDto = z.infer<typeof LearnOutlineShape>
export const LearnOutlineDto = named(LearnOutlineShape)

const LearnLessonShape = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  title: z.string(),
  type: LessonType,
  durationSec: z.number().int(),
  articleHtml: z.string().nullable(),
  video: z
    .object({
      status: z.enum(['uploading', 'processing', 'ready', 'failed']),
      posterUrl: z.string().nullable(),
    })
    .nullable(),
  resources: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      filename: z.string(),
      mime: z.string(),
      sizeBytes: z.number().int(),
      isImportant: z.boolean(),
    }),
  ),
  progress: z.object({ status: ProgressStatus, positionSec: z.number().int() }),
  previousLessonId: z.uuid().nullable(),
  nextLessonId: z.uuid().nullable(),
  refundable: z.boolean(),
  refund: z.object({ state: z.enum(['open', 'ended']), until: IsoDateTime.nullable() }).nullable(),
  watermark: z.string().nullable(),
})
export type LearnLessonDto = z.infer<typeof LearnLessonShape>
export const LearnLessonDto = named(LearnLessonShape)

const ContinueShape = z.object({
  courseId: z.uuid(),
  courseSlug: z.string(),
  courseTitle: z.string(),
  coverUrl: z.string().nullable(),
  progressPct: z.number().int(),
  lessonId: z.uuid(),
  lessonTitle: z.string(),
  lessonType: LessonType,
  positionSec: z.number().int(),
  durationSec: z.number().int(),
})
export type ContinueDto = z.infer<typeof ContinueShape>
export const ContinueDto = named(ContinueShape)

export const learnPlayerContract = {
  getCourseOutline: get(
    '/learn/courses/{courseSlug}',
    'Learn',
    'Course outline for the player',
    'Sections and lessons with my progress ticks and drip locks. NOT_ENROLLED if I can’t open the course.',
  )
    .input(z.object({ courseSlug: z.string().max(120) }))
    .output(LearnOutlineDto),
  getLesson: get(
    '/learn/lessons/{lessonId}',
    'Learn',
    'One lesson',
    'Article HTML, video state, files, my position, and the lessons before and after. LESSON_LOCKED says when it opens.',
  )
    .input(z.object({ lessonId: z.uuid() }))
    .output(LearnLessonDto),
  playback: get(
    '/learn/lessons/{lessonId}/playback',
    'Learn',
    'Play a video lesson',
    'Signed embed and HLS links (2 hours) and where to resume.',
  )
    .input(z.object({ lessonId: z.uuid() }))
    .output(
      z.object({
        embedUrl: z.string(),
        hlsUrl: z.string(),
        expiresAt: IsoDateTime,
        resumeAt: z.number().int(),
      }),
    ),
  resourceDownload: post(
    '/learn/lessons/{lessonId}/resources/{resourceId}/download',
    'Learn',
    'Download a lesson file',
    'A 5-minute link. An important file on a refundable purchase needs `confirmed: true`, because downloading it ends the refund right.',
  )
    .input(
      z.strictObject({
        lessonId: z.uuid(),
        resourceId: z.uuid(),
        confirmed: z.boolean().optional(),
      }),
    )
    .output(z.object({ url: z.string(), filename: z.string() })),
  continue: get(
    '/learn/continue',
    'Learn',
    'Continue learning',
    'The lesson to pick up next in the course I opened last, or null.',
  ).output(ContinueDto.nullable()),
}

const HeartbeatResultShape = z.object({
  recorded: z.boolean(),
  status: ProgressStatus,
  positionSec: z.number().int(),
  completedNow: z.boolean(),
  courseProgressPct: z.number().int().nullable(),
  streakExtendedTo: z.number().int().nullable(),
})

export const HeartbeatInput = z.strictObject({
  lessonId: z.uuid(),
  positionSec: Seconds,
  /** Seconds watched since the last beat, as the player saw it. The server clamps it. */
  watchedDeltaSec: z.number().min(0).max(3600),
  playbackRate: z.number().min(0.25).max(4).optional(),
})

export const progressContract = {
  heartbeat: post(
    '/progress/heartbeat',
    'Learning',
    'Save video progress',
    'Every 20 seconds while playing, and on pause or leave. Returns what the server recorded.',
  )
    .input(HeartbeatInput)
    .output(named(HeartbeatResultShape)),
  syncBatch: post(
    '/progress/sync',
    'Learning',
    'Upload offline progress',
    'Up to 100 beats recorded offline, each with the time it happened. Applied in time order.',
  )
    .input(
      z.strictObject({
        beats: z.array(HeartbeatInput.extend({ occurredAt: IsoDateTime })).max(100),
      }),
    )
    .output(z.object({ accepted: z.number().int() })),
  getCourse: get(
    '/progress/courses/{courseId}',
    'Learning',
    'My progress in a course',
    'Status and position for every lesson I started.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(
      z.object({
        courseId: z.uuid(),
        progressPct: z.number().int(),
        lessons: z.array(
          z.object({
            lessonId: z.uuid(),
            status: ProgressStatus,
            positionSec: z.number().int(),
            completedAt: IsoDateTime.nullable(),
          }),
        ),
      }),
    ),
  markComplete: post(
    '/progress/lessons/{lessonId}/complete',
    'Learning',
    'Mark a lesson complete',
    'For articles and file lessons. Videos complete by watching.',
  )
    .input(z.strictObject({ lessonId: z.uuid() }))
    .output(named(HeartbeatResultShape)),
}

const NoteShape = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  lessonId: z.uuid(),
  lessonTitle: z.string(),
  positionSec: z.number().int().nullable(),
  body: z.string(),
  createdAt: IsoDateTime,
})
export type NoteDto = z.infer<typeof NoteShape>
export const NoteDto = named(NoteShape)
const NoteBody = z.string().trim().min(1).max(2000)

export const notesContract = {
  list: get(
    '/notes',
    'Notes',
    'My notes',
    'For one lesson, one course, or all, with an optional search.',
  )
    .input(
      z.object({
        courseId: z.uuid().optional(),
        lessonId: z.uuid().optional(),
        q: z.string().trim().max(100).optional(),
      }),
    )
    .output(z.object({ items: z.array(NoteDto) })),
  create: post('/notes', 'Notes', 'Add a note', 'Plain text, up to 2,000 characters.')
    .input(
      z.strictObject({
        lessonId: z.uuid(),
        positionSec: Moment.nullable().optional(),
        body: NoteBody,
      }),
    )
    .output(z.object({ id: z.uuid(), positionSec: z.number().int().nullable(), body: z.string() })),
  update: post('/notes/{noteId}', 'Notes', 'Edit a note', 'Replaces the text.')
    .input(z.strictObject({ noteId: z.uuid(), body: NoteBody }))
    .output(z.object({ id: z.uuid(), body: z.string() })),
  delete: post('/notes/{noteId}/delete', 'Notes', 'Delete a note', 'Removes it for good.')
    .input(z.strictObject({ noteId: z.uuid() }))
    .output(z.object({ ok: z.literal(true) })),
  export: get(
    '/notes/export',
    'Notes',
    'Export notes',
    'My notes as Markdown, for one course or all.',
  )
    .input(z.object({ courseId: z.uuid().optional() }))
    .output(z.object({ markdown: z.string(), filename: z.string() })),
}

export const bookmarksContract = {
  list: get('/bookmarks', 'Notes', 'My bookmarks in a course', 'In course order.')
    .input(z.object({ courseId: z.uuid() }))
    .output(
      z.object({
        items: z.array(
          z.object({
            id: z.uuid(),
            lessonId: z.uuid(),
            lessonTitle: z.string(),
            positionSec: z.number().int().nullable(),
            createdAt: IsoDateTime,
          }),
        ),
      }),
    ),
  toggle: post(
    '/bookmarks/toggle',
    'Notes',
    'Bookmark or un-bookmark',
    'A lesson, or a moment in a video. Calling it again removes the bookmark.',
  )
    .input(z.strictObject({ lessonId: z.uuid(), positionSec: Moment.nullable().optional() }))
    .output(z.object({ bookmarked: z.boolean() })),
}

export const engagementContract = {
  getStreak: get(
    '/engagement/streak',
    'Learning',
    'My streak',
    'Days in a row with a finished lesson or 10 minutes of learning (Lagos days).',
  ).output(
    z.object({
      current: z.number().int(),
      longest: z.number().int(),
      freezeTokens: z.number().int(),
      todayCounted: z.boolean(),
      learnedTodaySec: z.number().int(),
    }),
  ),
  listBadges: get('/engagement/badges', 'Learning', 'Badges', 'Earned and still to earn.').output(
    z.object({
      items: z.array(
        z.object({
          code: z.string(),
          name: z.string(),
          description: z.string(),
          iconKey: z.string(),
          awardedAt: IsoDateTime.nullable(),
        }),
      ),
    }),
  ),
}

// ─── Studio: drip schedule and learners ───────────────────────────────────────────────────────

const LagosDay = z.iso.date()
export const DripMode = z.enum(['none', 'after_enrollment', 'fixed_dates', 'cohort_relative'])

const DripSettingsShape = z.object({
  courseId: z.uuid(),
  version: z.number().int(),
  mode: DripMode,
  cohortBased: z.boolean(),
  canEdit: z.boolean(),
  lessons: z.array(
    z.object({
      lessonId: z.uuid(),
      sectionTitle: z.string(),
      title: z.string(),
      isPreview: z.boolean(),
      isLive: z.boolean(),
      offsetDays: z.number().int().nullable(),
      date: LagosDay.nullable(),
    }),
  ),
})
export type DripSettingsDto = z.infer<typeof DripSettingsShape>
export const DripSettingsDto = named(DripSettingsShape)

const LearnerShape = z.object({
  enrollmentId: z.uuid(),
  displayName: z.string(),
  enrolledAt: IsoDateTime,
  status: z.enum(['active', 'completed', 'revoked', 'expired']),
  progressPct: z.number().int(),
  lastActiveAt: IsoDateTime.nullable(),
  cohortId: z.uuid().nullable(),
})
export type CourseLearnerDto = z.infer<typeof LearnerShape>
export const CourseLearnerDto = named(LearnerShape)

export const studioDripContract = {
  get: get(
    '/studio/courses/{courseId}/drip',
    'Studio',
    'Drip schedule',
    'When each lesson opens for learners.',
  )
    .input(z.object({ courseId: z.uuid() }))
    .output(DripSettingsDto),
  update: post(
    '/studio/courses/{courseId}/drip',
    'Studio',
    'Save the drip schedule',
    'Days after enrolling, or a date (Lagos time). Applies to the live course at once; lessons a learner already started stay open.',
  )
    .input(
      z.strictObject({
        courseId: z.uuid(),
        version: z.number().int().min(1),
        mode: DripMode,
        lessons: z
          .array(
            z.strictObject({
              lessonId: z.uuid(),
              offsetDays: z.number().int().min(0).max(365).nullable(),
              date: LagosDay.nullable(),
            }),
          )
          .max(500),
      }),
    )
    .output(DripSettingsDto),
}

export const studioLearnersContract = {
  list: get(
    '/studio/courses/{courseId}/learners',
    'Studio',
    'Learners',
    'Who is taking the course and how far they are. Display names only.',
  )
    .input(
      z.object({
        courseId: z.uuid(),
        status: z.enum(['active', 'completed']).optional(),
        q: z.string().trim().max(100).optional(),
        cursor: Cursor.optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(CourseLearnerDto),
        nextCursor: z.string().nullable(),
        total: z.number().int(),
      }),
    ),
}
