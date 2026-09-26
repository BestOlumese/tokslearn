import type { BundleDto, ReviewDto, StudioCourseDto, StudioCourseRow } from '@tokslearn/contract'
import * as catalog from '@tokslearn/core/catalog'
import * as courses from '@tokslearn/core/courses'
import { authed, pub, staff } from '../base'

// Studio, categories, video uploads and course review (docs/10 §1). Thin: auth → core → DTO.

const iso = (d: Date | null) => d?.toISOString() ?? null

export const toStudioCourseDto = (c: courses.StudioCourse): StudioCourseDto => ({
  ...c,
  revision: {
    ...c.revision,
    priceKobo: c.revision.priceKobo.toString(),
    compareAtKobo: c.revision.compareAtKobo?.toString() ?? null,
    refundPolicyDays: c.revision.refundPolicyDays as 0 | 3 | 7 | 14,
  },
  livePriceKobo: c.livePriceKobo?.toString() ?? null,
  history: c.history.map((h) => ({
    ...h,
    submittedAt: iso(h.submittedAt),
    reviewedAt: iso(h.reviewedAt),
  })),
})

const toBundleDto = (b: Awaited<ReturnType<typeof courses.getBundle>>): BundleDto => ({
  id: b.id,
  slug: b.slug,
  title: b.title,
  description: b.description,
  priceKobo: b.priceKobo.toString(),
  status: b.status,
  courseIds: b.courseIds,
  updatedAt: b.updatedAt.toISOString(),
})

export const toReviewDto = (r: Awaited<ReturnType<typeof courses.getReview>>): ReviewDto => ({
  ...r,
  submittedAt: iso(r.submittedAt),
  priceKobo: r.priceKobo.toString(),
  livePriceKobo: r.livePriceKobo?.toString() ?? null,
  checklistKeys: [...r.checklistKeys],
  diff: {
    firstVersion: r.diff.firstVersion,
    fields: r.diff.fields,
    outline: r.diff.outline.map((o) => ({ ...o })),
  },
})

const staffDtos = (rows: Awaited<ReturnType<typeof courses.listStaff>>) =>
  rows.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() }))

const out = async (p: Promise<courses.StudioCourse>) => toStudioCourseDto(await p)
const kobo = (s: string) => BigInt(s)

export const studioRouter = {
  courses: {
    list: authed.studio.courses.list.handler(async ({ context }) =>
      (await courses.listMyCourses(context.ctx)).map(
        (c): StudioCourseRow => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          status: c.status,
          revisionStatus: c.revisionStatus,
          isPublished: c.hasLive,
          priceKobo: c.priceKobo.toString(),
          updatedAt: c.updatedAt.toISOString(),
        }),
      ),
    ),
    get: authed.studio.courses.get.handler(({ context, input }) =>
      out(courses.getStudioCourse(context.ctx, input.courseId)),
    ),
    create: authed.studio.courses.create.handler(({ context, input }) =>
      out(courses.createCourse(context.ctx, input)),
    ),
    updateDetails: authed.studio.courses.updateDetails.handler(({ context, input }) =>
      out(courses.updateDetails(context.ctx, input)),
    ),
    updatePricing: authed.studio.courses.updatePricing.handler(({ context, input }) =>
      out(
        courses.updatePricing(context.ctx, {
          ...input,
          priceKobo: kobo(input.priceKobo),
          compareAtKobo: input.compareAtKobo === null ? null : kobo(input.compareAtKobo),
        }),
      ),
    ),
    submit: authed.studio.courses.submit.handler(async ({ context, input }) => {
      const r = await courses.submitForReview(context.ctx, input)
      return { outcome: r.outcome, course: toStudioCourseDto(r.studio) }
    }),
  },
  sections: {
    add: authed.studio.sections.add.handler(({ context, input }) =>
      out(courses.addSection(context.ctx, input)),
    ),
    rename: authed.studio.sections.rename.handler(({ context, input }) =>
      out(courses.renameSection(context.ctx, input)),
    ),
    remove: authed.studio.sections.remove.handler(({ context, input }) =>
      out(courses.removeSection(context.ctx, input)),
    ),
    move: authed.studio.sections.move.handler(({ context, input }) =>
      out(courses.moveSection(context.ctx, input)),
    ),
  },
  lessons: {
    add: authed.studio.lessons.add.handler(({ context, input }) =>
      out(courses.addLesson(context.ctx, input)),
    ),
    update: authed.studio.lessons.update.handler(({ context, input }) =>
      out(courses.updateLesson(context.ctx, input)),
    ),
    remove: authed.studio.lessons.remove.handler(({ context, input }) =>
      out(courses.removeLesson(context.ctx, input)),
    ),
    move: authed.studio.lessons.move.handler(({ context, input }) =>
      out(courses.moveLesson(context.ctx, input)),
    ),
    refreshVideo: authed.studio.lessons.refreshVideo.handler(({ context, input }) =>
      out(courses.refreshLessonVideo(context.ctx, input)),
    ),
  },
  resources: {
    add: authed.studio.resources.add.handler(({ context, input }) =>
      out(courses.addResource(context.ctx, input)),
    ),
    update: authed.studio.resources.update.handler(({ context, input }) =>
      out(courses.updateResource(context.ctx, input)),
    ),
    remove: authed.studio.resources.remove.handler(({ context, input }) =>
      out(courses.removeResource(context.ctx, input)),
    ),
  },
  staff: {
    list: authed.studio.staff.list.handler(async ({ context, input }) =>
      staffDtos(await courses.listStaff(context.ctx, input.courseId)),
    ),
    add: authed.studio.staff.add.handler(async ({ context, input }) =>
      staffDtos(await courses.addStaff(context.ctx, input)),
    ),
    remove: authed.studio.staff.remove.handler(async ({ context, input }) =>
      staffDtos(await courses.removeStaff(context.ctx, input)),
    ),
  },
  bundles: {
    list: authed.studio.bundles.list.handler(async ({ context }) =>
      (await courses.listMyBundles(context.ctx)).map(toBundleDto),
    ),
    get: authed.studio.bundles.get.handler(async ({ context, input }) =>
      toBundleDto(await courses.getBundle(context.ctx, input.bundleId)),
    ),
    create: authed.studio.bundles.create.handler(async ({ context, input }) =>
      toBundleDto(
        await courses.createBundle(context.ctx, { ...input, priceKobo: kobo(input.priceKobo) }),
      ),
    ),
    update: authed.studio.bundles.update.handler(async ({ context, input }) =>
      toBundleDto(
        await courses.updateBundle(context.ctx, {
          ...input,
          id: input.bundleId,
          priceKobo: kobo(input.priceKobo),
        }),
      ),
    ),
    archive: authed.studio.bundles.archive.handler(async ({ context, input }) => {
      await courses.archiveBundle(context.ctx, input.bundleId)
      return { ok: true as const }
    }),
  },
}

export const catalogRouter = {
  categories: pub.catalog.categories.handler(async ({ context }) =>
    catalog.listCategoryTree(context.ctx),
  ),
}

export const createVideoUploadHandler = authed.media.createVideoUpload.handler(
  async ({ context, input }) => {
    const r = await courses.startLessonVideoUpload(context.ctx, input)
    return {
      videoAssetId: r.videoAssetId,
      upload: { ...r.upload, expiresAt: r.upload.expiresAt.toISOString() },
      course: toStudioCourseDto(r.studio),
    }
  },
)

const reviewers = staff('reviewer', 'admin', 'super_admin')

export const adminCourseReviewsRouter = {
  list: reviewers.admin.courseReviews.list.handler(async ({ context }) =>
    (await courses.listReviewQueue(context.ctx)).map((r) => ({
      ...r,
      submittedAt: iso(r.submittedAt),
    })),
  ),
  get: reviewers.admin.courseReviews.get.handler(async ({ context, input }) =>
    toReviewDto(await courses.getReview(context.ctx, input.revisionId)),
  ),
  previewLesson: reviewers.admin.courseReviews.previewLesson.handler(({ context, input }) =>
    courses.previewLessonForReview(context.ctx, input),
  ),
  decide: reviewers.admin.courseReviews.decide.handler(async ({ context, input }) =>
    toReviewDto(await courses.decideReview(context.ctx, input)),
  ),
}
