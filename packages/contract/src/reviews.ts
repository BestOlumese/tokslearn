import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'

// Phase 9 reviews and ratings (docs/06 §5, docs/10 §12, docs/20 Phase 9 rows, ADR-040).

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: [tag], summary, description })
const post = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: [tag], summary, description })

const ok = z.object({ ok: z.literal(true) })
const Rating = z.number().int().min(1).max(5)
const Stars = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])
export const ReviewSort = z.enum(['helpful', 'recent'])
export type ReviewSort = z.infer<typeof ReviewSort>

const MyReviewShape = z.object({
  id: z.uuid(),
  rating: Rating,
  body: z.string().nullable(),
  /** Hidden by Tokslearn staff. */
  hidden: z.boolean(),
  instructorReply: z.string().nullable(),
  createdAt: IsoDateTime,
  editedAt: IsoDateTime.nullable(),
})
export type MyReviewDto = z.infer<typeof MyReviewShape>
export const MyReviewDto = named(MyReviewShape)

const MyReviewPageShape = z.object({
  course: z.object({ id: z.uuid(), slug: z.string(), title: z.string() }),
  eligibility: z.object({
    eligible: z.boolean(),
    progressPct: z.number().int(),
    minutesLearned: z.number().int(),
    needPct: z.number(),
    needMinutes: z.number(),
  }),
  review: MyReviewShape.nullable(),
})
export type MyReviewPageDto = z.infer<typeof MyReviewPageShape>
export const MyReviewPageDto = named(MyReviewPageShape)

const PublicReviewShape = z.object({
  id: z.uuid(),
  rating: Rating,
  body: z.string().nullable(),
  authorName: z.string(),
  finished: z.boolean(),
  helpfulCount: z.number().int(),
  votedByMe: z.boolean(),
  mine: z.boolean(),
  instructorReply: z.object({ body: z.string(), at: IsoDateTime }).nullable(),
  createdAt: IsoDateTime,
  editedAt: IsoDateTime.nullable(),
})
const ReviewPageShape = z.object({
  summary: z.object({
    count: z.number().int(),
    /** Null below 3 reviews. */
    avg: z.number().nullable(),
    /** Null below 3 reviews; index 0 is one star. */
    stars: Stars.nullable(),
  }),
  items: z.array(PublicReviewShape),
  hasMore: z.boolean(),
})
export type ReviewPageDto = z.infer<typeof ReviewPageShape>
export const ReviewPageDto = named(ReviewPageShape)

const StudioReviewShape = z.object({
  id: z.uuid(),
  course: z.object({ id: z.uuid(), title: z.string(), slug: z.string() }),
  rating: Rating,
  body: z.string().nullable(),
  authorName: z.string(),
  hidden: z.boolean(),
  helpfulCount: z.number().int(),
  reply: z.string().nullable(),
  repliedAt: IsoDateTime.nullable(),
  canReply: z.boolean(),
  createdAt: IsoDateTime,
  editedAt: IsoDateTime.nullable(),
})
export type StudioReviewDto = z.infer<typeof StudioReviewShape>
export const StudioReviewDto = named(StudioReviewShape)

const ReviewReportShape = z.object({
  reviewId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  rating: Rating,
  body: z.string().nullable(),
  authorName: z.string(),
  reason: z.string(),
  reports: z.number().int(),
  createdAt: IsoDateTime,
})
export type ReviewReportDto = z.infer<typeof ReviewReportShape>
export const ReviewReportDto = named(ReviewReportShape)

export const reviewsContract = {
  mine: get(
    '/learn/{courseSlug}/review',
    'Learning',
    'My review',
    'Whether the learner may review yet (20% done or 30 minutes learned, by default) and their review.',
  )
    .input(z.object({ courseSlug: z.string().min(1).max(200) }))
    .output(MyReviewPageDto),
  save: post(
    '/courses/{courseId}/review',
    'Learning',
    'Write or edit my review',
    'One per learner per course; writing again edits it. REVIEW_NOT_ELIGIBLE (data: pct, minutes), CONTENT_REJECTED.',
  )
    .input(
      z.strictObject({
        courseId: z.uuid(),
        rating: Rating,
        body: z.string().max(2000).nullable(),
      }),
    )
    .output(MyReviewDto),
  remove: post(
    '/courses/{courseId}/review/delete',
    'Learning',
    'Delete my review',
    'The learner can write a new one later.',
  )
    .input(z.strictObject({ courseId: z.uuid() }))
    .output(ok),
  list: get(
    '/courses/{courseId}/reviews',
    'Catalog',
    'Course reviews',
    'Public. Visible reviews, most helpful or newest first, 10 a page. The average and star counts are null until a course has 3 reviews.',
  )
    .input(
      z.object({
        courseId: z.uuid(),
        sort: ReviewSort.default('helpful'),
        page: z.coerce.number().int().min(0).max(500).default(0),
      }),
    )
    .output(ReviewPageDto),
  vote: post(
    '/reviews/{reviewId}/helpful',
    'Catalog',
    'Mark a review helpful',
    'Signed in; not your own review (REVIEW_OWN). `on: false` takes the vote back.',
  )
    .input(z.strictObject({ reviewId: z.uuid(), on: z.boolean() }))
    .output(z.object({ helpfulCount: z.number().int(), votedByMe: z.boolean() })),
  report: post(
    '/reviews/{reviewId}/report',
    'Catalog',
    'Report a review',
    'Once per person per review. Staff see it in the moderation queue.',
  )
    .input(z.strictObject({ reviewId: z.uuid(), reason: z.string().trim().min(3).max(500) }))
    .output(ok),
}

export const studioReviewsContract = {
  list: get(
    '/studio/reviews',
    'Studio',
    'Reviews of my courses',
    'Newest first, 20 a page; `unreplied` for those waiting for a reply. TAs read; the instructor and co-instructors reply.',
  )
    .input(
      z.object({
        courseId: z.uuid().optional(),
        filter: z.enum(['all', 'unreplied']).default('all'),
        page: z.coerce.number().int().min(0).max(500).default(0),
      }),
    )
    .output(z.object({ items: z.array(StudioReviewDto), hasMore: z.boolean() })),
  reply: post(
    '/studio/reviews/{reviewId}/reply',
    'Studio',
    'Reply to a review',
    'One reply per review, editable; `body: null` removes it.',
  )
    .input(z.strictObject({ reviewId: z.uuid(), body: z.string().trim().max(2000).nullable() }))
    .output(ok),
}

export const adminReviewsContract = {
  reports: get(
    '/admin/review-reports',
    'Admin',
    'Reported reviews',
    'Reviews with open reports, oldest first. Support staff and above.',
  ).output(z.object({ items: z.array(ReviewReportDto) })),
  handle: post(
    '/admin/review-reports/{reviewId}',
    'Admin',
    'Handle a reported review',
    'Hide it (resolves its reports), dismiss the reports, or show a hidden review again.',
  )
    .input(z.strictObject({ reviewId: z.uuid(), action: z.enum(['hide', 'dismiss', 'show']) }))
    .output(ok),
}
