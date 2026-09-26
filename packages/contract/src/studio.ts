import { z } from 'zod'
import { base } from './base'
import { RichTextDoc } from './rich-text'
import { IsoDateTime } from './shared'

// Instructor studio (docs/10 §1, docs/20 §5), categories, and admin course review (docs/20 §6).
// Every studio write takes the course `version` it edited and returns the refreshed course; a
// stale version fails with VERSION_CONFLICT.

/** Kobo as a decimal string (docs/06 §3.7). */
export const Kobo = z.string().regex(/^\d{1,13}$/)

export const CourseStatus = z.enum([
  'draft',
  'in_review',
  'changes_requested',
  'published',
  'unlisted',
  'archived',
])
export const RevisionStatus = z.enum(['draft', 'submitted', 'approved', 'rejected', 'superseded'])
export const CourseLevel = z.enum(['beginner', 'intermediate', 'advanced', 'all'])
export const LessonType = z.enum(['video', 'article', 'quiz', 'assignment', 'live', 'resource'])
export const NewLessonType = z.enum(['video', 'article', 'resource'])
export const VideoStatus = z.enum(['uploading', 'processing', 'ready', 'failed'])
export const RefundPolicyDays = z.union([z.literal(0), z.literal(3), z.literal(7), z.literal(14)])
export const ChecklistKey = z.enum([
  'title',
  'description',
  'outcomes',
  'category',
  'cover',
  'curriculum',
  'preview',
  'videos_ready',
  'lessons_complete',
  'pricing',
  'minimum_content',
])
export const ReviewChecklistKey = z.enum([
  'rights',
  'rules',
  'quality',
  'accuracy',
  'price',
  'previews',
  'resources',
])

export const CategoryDto = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  children: z.array(z.object({ id: z.uuid(), slug: z.string(), name: z.string() })),
})

export const StudioResourceDto = z.object({
  id: z.uuid(),
  title: z.string(),
  isImportant: z.boolean(),
  fileId: z.uuid(),
  mime: z.string(),
  sizeBytes: z.number().int(),
})

export const StudioLessonDto = z.object({
  id: z.uuid(),
  sectionId: z.uuid(),
  title: z.string(),
  type: LessonType,
  position: z.number().int(),
  isPreview: z.boolean(),
  durationSec: z.number().int(),
  isLive: z.boolean(),
  removalRequested: z.boolean(),
  video: z.object({ assetId: z.uuid(), status: VideoStatus, filename: z.string() }).nullable(),
  articleDoc: RichTextDoc.nullable(),
  resources: z.array(StudioResourceDto),
})
export type StudioLessonDto = z.infer<typeof StudioLessonDto>

export const StudioSectionDto = z.object({
  id: z.uuid(),
  title: z.string(),
  position: z.number().int(),
  isLive: z.boolean(),
  removalRequested: z.boolean(),
  lessons: z.array(StudioLessonDto),
})
export type StudioSectionDto = z.infer<typeof StudioSectionDto>

export const StudioCourseDto = z.object({
  id: z.uuid(),
  slug: z.string(),
  status: CourseStatus,
  version: z.number().int(),
  isPublished: z.boolean(),
  canEdit: z.boolean(),
  revision: z.object({
    id: z.uuid(),
    number: z.number().int(),
    status: RevisionStatus,
    title: z.string(),
    subtitle: z.string().nullable(),
    descriptionDoc: RichTextDoc.nullable(),
    outcomes: z.array(z.string()),
    requirements: z.array(z.string()),
    categoryId: z.uuid().nullable(),
    level: CourseLevel,
    language: z.string(),
    priceKobo: Kobo,
    compareAtKobo: Kobo.nullable(),
    refundPolicyDays: RefundPolicyDays,
    certificateMode: z.enum(['none', 'completion', 'exam', 'external']),
    coverFileId: z.uuid().nullable(),
    coverUrl: z.string().nullable(),
    reviewNotes: z.string().nullable(),
  }),
  livePriceKobo: Kobo.nullable(),
  tags: z.array(z.string()),
  sections: z.array(StudioSectionDto),
  checklist: z.array(z.object({ key: ChecklistKey, done: z.boolean() })),
  history: z.array(
    z.object({
      id: z.uuid(),
      number: z.number().int(),
      status: RevisionStatus,
      reviewNotes: z.string().nullable(),
      submittedAt: IsoDateTime.nullable(),
      reviewedAt: IsoDateTime.nullable(),
    }),
  ),
})
export type StudioCourseDto = z.infer<typeof StudioCourseDto>

export const StudioCourseRow = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  status: CourseStatus,
  revisionStatus: RevisionStatus,
  isPublished: z.boolean(),
  priceKobo: Kobo,
  updatedAt: IsoDateTime,
})
export type StudioCourseRow = z.infer<typeof StudioCourseRow>

export const StaffDto = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  role: z.enum(['co_instructor', 'teaching_assistant']),
  createdAt: IsoDateTime,
})

export const BundleDto = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  priceKobo: Kobo,
  status: z.enum(['draft', 'active', 'archived']),
  courseIds: z.array(z.uuid()),
  updatedAt: IsoDateTime,
})
export type BundleDto = z.infer<typeof BundleDto>

const Title = z.string().trim().min(3).max(120)
const Versioned = { courseId: z.uuid(), version: z.number().int().min(1) }
const post = (path: `/${string}`, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: ['Studio'], summary, description })

const courseOut = <T extends z.ZodRawShape>(shape: T) => z.strictObject({ ...Versioned, ...shape })

export const studioContract = {
  courses: {
    list: base
      .route({
        method: 'GET',
        path: '/studio/courses',
        tags: ['Studio'],
        summary: 'My courses',
        description: 'Courses I teach, newest change first.',
      })
      .output(z.array(StudioCourseRow)),

    get: base
      .route({
        method: 'GET',
        path: '/studio/courses/{courseId}',
        tags: ['Studio'],
        summary: 'A course in the studio',
        description: 'The draft (or live) version with its outline and publish checklist.',
      })
      .input(z.object({ courseId: z.uuid() }))
      .output(StudioCourseDto),

    create: post('/studio/courses', 'Create a course', 'Starts a draft course. Instructors only.')
      .input(z.strictObject({ title: Title, categoryId: z.uuid() }))
      .output(StudioCourseDto),

    updateDetails: post(
      '/studio/courses/{courseId}/details',
      'Save course details',
      'Title, subtitle, description, outcomes, requirements, level, language, category, cover and tags.',
    )
      .input(
        courseOut({
          title: Title,
          subtitle: z.string().trim().max(160).nullable(),
          description: RichTextDoc.nullable(),
          outcomes: z.array(z.string().trim().max(160)).max(10),
          requirements: z.array(z.string().trim().max(160)).max(10),
          level: CourseLevel,
          language: z.enum(['en', 'yo', 'ig', 'ha', 'pcm', 'fr']),
          categoryId: z.uuid(),
          coverFileId: z.uuid().nullable(),
          tags: z.array(z.string().trim().min(2).max(40)).max(10),
        }),
      )
      .output(StudioCourseDto),

    updatePricing: post(
      '/studio/courses/{courseId}/pricing',
      'Save pricing',
      'Price in kobo (0 = free, else ₦1,000–₦5,000,000), optional old price, refund window. On a published course, a rise over 50% waits for review.',
    )
      .input(
        courseOut({
          priceKobo: Kobo,
          compareAtKobo: Kobo.nullable(),
          refundPolicyDays: RefundPolicyDays,
        }),
      )
      .output(StudioCourseDto),

    submit: post(
      '/studio/courses/{courseId}/submit',
      'Submit for review',
      'Needs a complete publish checklist. Small updates to a published course are approved at once.',
    )
      .input(courseOut({}))
      .output(
        z.object({ outcome: z.enum(['submitted', 'auto_approved']), course: StudioCourseDto }),
      ),
  },

  sections: {
    add: post('/studio/courses/{courseId}/sections', 'Add a section', 'Adds a section at the end.')
      .input(courseOut({ title: Title }))
      .output(StudioCourseDto),
    rename: post(
      '/studio/courses/{courseId}/sections/{sectionId}/rename',
      'Rename a section',
      'Changes the section title.',
    )
      .input(courseOut({ sectionId: z.uuid(), title: Title }))
      .output(StudioCourseDto),
    remove: post(
      '/studio/courses/{courseId}/sections/{sectionId}/remove',
      'Remove a section',
      'Deletes a section that was never live; a live one is removed when the next update is approved.',
    )
      .input(courseOut({ sectionId: z.uuid() }))
      .output(StudioCourseDto),
    move: post(
      '/studio/courses/{courseId}/sections/{sectionId}/move',
      'Move a section',
      'Moves a section to a new position (0-based).',
    )
      .input(courseOut({ sectionId: z.uuid(), toIndex: z.number().int().min(0) }))
      .output(StudioCourseDto),
  },

  lessons: {
    add: post(
      '/studio/courses/{courseId}/lessons',
      'Add a lesson',
      'Adds a lesson at the end of a section.',
    )
      .input(courseOut({ sectionId: z.uuid(), type: NewLessonType, title: Title }))
      .output(StudioCourseDto),
    update: post(
      '/studio/courses/{courseId}/lessons/{lessonId}/update',
      'Edit a lesson',
      'Title, free preview, or the text of an article lesson.',
    )
      .input(
        courseOut({
          lessonId: z.uuid(),
          title: Title.optional(),
          isPreview: z.boolean().optional(),
          article: RichTextDoc.nullable().optional(),
        }),
      )
      .output(StudioCourseDto),
    remove: post(
      '/studio/courses/{courseId}/lessons/{lessonId}/remove',
      'Remove a lesson',
      'Deletes a lesson that was never live; a live one is removed when the next update is approved.',
    )
      .input(courseOut({ lessonId: z.uuid() }))
      .output(StudioCourseDto),
    move: post(
      '/studio/courses/{courseId}/lessons/{lessonId}/move',
      'Move a lesson',
      'Moves a lesson to a position in the same or another section (0-based).',
    )
      .input(
        courseOut({ lessonId: z.uuid(), toSectionId: z.uuid(), toIndex: z.number().int().min(0) }),
      )
      .output(StudioCourseDto),
    refreshVideo: post(
      '/studio/courses/{courseId}/lessons/{lessonId}/video/refresh',
      'Check a video again',
      'Asks the video host for the latest processing status.',
    )
      .input(z.strictObject({ courseId: z.uuid(), lessonId: z.uuid() }))
      .output(StudioCourseDto),
  },

  resources: {
    add: post(
      '/studio/courses/{courseId}/lessons/{lessonId}/resources',
      'Attach a file',
      'Attaches an uploaded resource file to a lesson. Important files make a sale non-refundable once downloaded.',
    )
      .input(
        courseOut({
          lessonId: z.uuid(),
          fileId: z.uuid(),
          title: z.string().trim().min(1).max(120),
          isImportant: z.boolean(),
        }),
      )
      .output(StudioCourseDto),
    update: post(
      '/studio/courses/{courseId}/resources/{resourceId}/update',
      'Edit a file',
      'Renames a file or changes whether it is important.',
    )
      .input(
        courseOut({
          resourceId: z.uuid(),
          title: z.string().trim().min(1).max(120).optional(),
          isImportant: z.boolean().optional(),
        }),
      )
      .output(StudioCourseDto),
    remove: post(
      '/studio/courses/{courseId}/resources/{resourceId}/remove',
      'Remove a file',
      'Detaches a file from its lesson.',
    )
      .input(courseOut({ resourceId: z.uuid() }))
      .output(StudioCourseDto),
  },

  staff: {
    list: base
      .route({
        method: 'GET',
        path: '/studio/courses/{courseId}/staff',
        tags: ['Studio'],
        summary: 'Teaching assistants',
        description: 'People who help with this course.',
      })
      .input(z.object({ courseId: z.uuid() }))
      .output(z.array(StaffDto)),
    add: post(
      '/studio/courses/{courseId}/staff',
      'Add a teaching assistant',
      'Adds an existing Tokslearn user by email or username.',
    )
      .input(
        z.strictObject({ courseId: z.uuid(), emailOrUsername: z.string().trim().min(2).max(200) }),
      )
      .output(z.array(StaffDto)),
    remove: post(
      '/studio/courses/{courseId}/staff/{staffId}/remove',
      'Remove a teaching assistant',
      'Removes their access to the course.',
    )
      .input(z.strictObject({ courseId: z.uuid(), staffId: z.uuid() }))
      .output(z.array(StaffDto)),
  },

  bundles: {
    list: base
      .route({
        method: 'GET',
        path: '/studio/bundles',
        tags: ['Studio'],
        summary: 'My bundles',
        description: 'Bundles of my courses, excluding archived ones.',
      })
      .output(z.array(BundleDto)),
    get: base
      .route({
        method: 'GET',
        path: '/studio/bundles/{bundleId}',
        tags: ['Studio'],
        summary: 'A bundle',
        description: 'One bundle with its courses.',
      })
      .input(z.object({ bundleId: z.uuid() }))
      .output(BundleDto),
    create: post(
      '/studio/bundles',
      'Create a bundle',
      'An active bundle needs two or more published courses.',
    )
      .input(
        z.strictObject({
          title: Title,
          description: z.string().trim().max(1000).nullable(),
          priceKobo: Kobo,
          courseIds: z.array(z.uuid()).min(1).max(20),
          status: z.enum(['draft', 'active']),
        }),
      )
      .output(BundleDto),
    update: post('/studio/bundles/{bundleId}', 'Edit a bundle', 'Title, price, courses and status.')
      .input(
        z.strictObject({
          bundleId: z.uuid(),
          title: Title,
          description: z.string().trim().max(1000).nullable(),
          priceKobo: Kobo,
          courseIds: z.array(z.uuid()).min(1).max(20),
          status: z.enum(['draft', 'active']),
        }),
      )
      .output(BundleDto),
    archive: post('/studio/bundles/{bundleId}/archive', 'Archive a bundle', 'Stops selling it.')
      .input(z.strictObject({ bundleId: z.uuid() }))
      .output(z.object({ ok: z.literal(true) })),
  },
}

export const catalogContract = {
  categories: base
    .route({
      method: 'GET',
      path: '/categories',
      tags: ['Catalog'],
      summary: 'Categories',
      description: 'Top categories with their subcategories, in display order.',
    })
    .output(z.array(CategoryDto)),
}

export const UploadAuthorizationDto = z.object({
  endpoint: z.url(),
  headers: z.object({
    AuthorizationSignature: z.string(),
    AuthorizationExpire: z.string(),
    VideoId: z.string(),
    LibraryId: z.string(),
  }),
  expiresAt: IsoDateTime,
})

export const createVideoUpload = base
  .route({
    method: 'POST',
    path: '/media/videos',
    tags: ['Media'],
    summary: 'Start a video upload',
    description:
      'Creates the video for a lesson and returns signed headers for a resumable (TUS) upload straight to the video host. Up to 4 GB.',
  })
  .input(
    courseOut({
      lessonId: z.uuid(),
      filename: z.string().trim().min(1).max(200),
      sizeBytes: z.number().int().positive(),
      mime: z.string().max(100),
    }),
  )
  .output(
    z.object({ videoAssetId: z.uuid(), upload: UploadAuthorizationDto, course: StudioCourseDto }),
  )

// ─── Admin course review ───────────────────────────────────────────────────────────────────────

export const ReviewQueueRow = z.object({
  revisionId: z.uuid(),
  courseId: z.uuid(),
  title: z.string(),
  number: z.number().int(),
  submittedAt: IsoDateTime.nullable(),
  isUpdate: z.boolean(),
  instructorName: z.string(),
})

export const ReviewDto = z.object({
  revisionId: z.uuid(),
  courseId: z.uuid(),
  slug: z.string(),
  number: z.number().int(),
  status: RevisionStatus,
  submittedAt: IsoDateTime.nullable(),
  instructorName: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  descriptionHtml: z.string().nullable(),
  outcomes: z.array(z.string()),
  requirements: z.array(z.string()),
  categoryName: z.string().nullable(),
  level: CourseLevel,
  language: z.string(),
  priceKobo: Kobo,
  livePriceKobo: Kobo.nullable(),
  refundPolicyDays: z.number().int(),
  coverUrl: z.string().nullable(),
  outline: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      isNew: z.boolean(),
      lessons: z.array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          type: LessonType,
          isPreview: z.boolean(),
          durationSec: z.number().int(),
          isNew: z.boolean(),
          videoStatus: VideoStatus.nullable(),
          resourceCount: z.number().int(),
        }),
      ),
    }),
  ),
  diff: z.object({
    firstVersion: z.boolean(),
    fields: z.array(z.object({ field: z.string(), before: z.unknown(), after: z.unknown() })),
    outline: z.array(z.record(z.string(), z.string())),
  }),
  checklistKeys: z.array(ReviewChecklistKey),
  reviewNotes: z.string().nullable(),
})
export type ReviewDto = z.infer<typeof ReviewDto>

export const LessonPreviewDto = z.object({
  id: z.uuid(),
  title: z.string(),
  type: LessonType,
  embedUrl: z.string().nullable(),
  videoStatus: VideoStatus.nullable(),
  articleHtml: z.string().nullable(),
  resources: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      isImportant: z.boolean(),
      mime: z.string(),
      sizeBytes: z.number().int(),
      url: z.string(),
    }),
  ),
})

export const adminCourseReviewsContract = {
  list: base
    .route({
      method: 'GET',
      path: '/admin/course-reviews',
      tags: ['Admin'],
      summary: 'Course review queue',
      description: 'Submitted courses and updates, oldest first. Reviewers and admins only.',
    })
    .output(z.array(ReviewQueueRow)),
  get: base
    .route({
      method: 'GET',
      path: '/admin/course-reviews/{revisionId}',
      tags: ['Admin'],
      summary: 'A course under review',
      description: 'Details, outline and what changed since the live version.',
    })
    .input(z.object({ revisionId: z.uuid() }))
    .output(ReviewDto),
  previewLesson: base
    .route({
      method: 'GET',
      path: '/admin/course-reviews/{revisionId}/lessons/{lessonId}',
      tags: ['Admin'],
      summary: 'Preview a lesson',
      description: 'A signed video link, the article and file links for one lesson.',
    })
    .input(z.object({ revisionId: z.uuid(), lessonId: z.uuid() }))
    .output(LessonPreviewDto),
  decide: base
    .route({
      method: 'POST',
      path: '/admin/course-reviews/{revisionId}/decision',
      tags: ['Admin'],
      summary: 'Approve or request changes',
      description:
        'Approving needs every checklist item ticked and publishes the course. Requesting changes needs notes the instructor will read.',
    })
    .input(
      z.strictObject({
        revisionId: z.uuid(),
        decision: z.enum(['approve', 'request_changes']),
        notes: z.string().trim().min(3).max(4000),
        checklist: z.partialRecord(ReviewChecklistKey, z.boolean()),
      }),
    )
    .output(ReviewDto),
}
