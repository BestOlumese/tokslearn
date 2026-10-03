import type {
  MyReviewDto,
  ReviewPageDto,
  ReviewReportDto,
  StudioReviewDto,
} from '@tokslearn/contract'
import * as reviews from '@tokslearn/core/reviews'
import { authed, pub } from '../base'

// Reviews (docs/06 §5, docs/10 §12). Thin: auth → core → DTO.

const iso = (d: Date) => d.toISOString()
const isoN = (d: Date | null) => (d ? d.toISOString() : null)
const ok = { ok: true as const }

const toMine = (r: reviews.MyReview): MyReviewDto => ({
  ...r,
  createdAt: iso(r.createdAt),
  editedAt: isoN(r.editedAt),
})

export const toReviewPageDto = (p: reviews.ReviewPage): ReviewPageDto => ({
  summary: p.summary,
  hasMore: p.hasMore,
  items: p.items.map((r) => ({
    ...r,
    createdAt: iso(r.createdAt),
    editedAt: isoN(r.editedAt),
    instructorReply: r.instructorReply
      ? { body: r.instructorReply.body, at: iso(r.instructorReply.at) }
      : null,
  })),
})

const toStudio = (r: reviews.StudioReview): StudioReviewDto => ({
  ...r,
  createdAt: iso(r.createdAt),
  editedAt: isoN(r.editedAt),
  repliedAt: isoN(r.repliedAt),
})

const toReport = (r: reviews.ReviewReportView): ReviewReportDto => ({
  ...r,
  createdAt: iso(r.createdAt),
})

export const reviewsRouter = {
  mine: authed.reviews.mine.handler(async ({ context, input }) => {
    const p = await reviews.getMyReview(context.ctx, input.courseSlug)
    return { ...p, review: p.review ? toMine(p.review) : null }
  }),
  save: authed.reviews.save.handler(async ({ context, input }) =>
    toMine(await reviews.saveReview(context.ctx, input)),
  ),
  remove: authed.reviews.remove.handler(async ({ context, input }) => {
    await reviews.deleteMyReview(context.ctx, input.courseId)
    return ok
  }),
  list: pub.reviews.list.handler(async ({ context, input }) =>
    toReviewPageDto(await reviews.listCourseReviews(context.ctx, input)),
  ),
  vote: authed.reviews.vote.handler(({ context, input }) =>
    reviews.voteHelpful(context.ctx, input),
  ),
  report: authed.reviews.report.handler(async ({ context, input }) => {
    await reviews.reportReview(context.ctx, input)
    return ok
  }),
}

export const studioReviewsRouter = {
  list: authed.studio.reviews.list.handler(async ({ context, input }) => {
    const r = await reviews.listStudioReviews(context.ctx, input)
    return { items: r.items.map(toStudio), hasMore: r.hasMore }
  }),
  reply: authed.studio.reviews.reply.handler(async ({ context, input }) => {
    await reviews.replyToReview(context.ctx, input)
    return ok
  }),
}

export const adminReviewsRouter = {
  reports: authed.admin.reviews.reports.handler(async ({ context }) => ({
    items: (await reviews.listReviewReports(context.ctx)).map(toReport),
  })),
  handle: authed.admin.reviews.handle.handler(async ({ context, input }) => {
    if (input.action === 'dismiss') await reviews.dismissReviewReports(context.ctx, input.reviewId)
    else
      await reviews.setReviewHidden(context.ctx, {
        reviewId: input.reviewId,
        hidden: input.action === 'hide',
      })
    return ok
  }),
}
