import type {
  ReportDto,
  ThreadDto,
  ThreadSummaryDto,
  UnansweredQuestionDto,
} from '@tokslearn/contract'
import * as community from '@tokslearn/core/community'
import { authed } from '../base'

// Community (docs/06 §5, docs/10 §10). Thin: auth → core → DTO.

const iso = (d: Date) => d.toISOString()
const ok = { ok: true as const }

const toSummary = (t: community.ThreadSummary): ThreadSummaryDto => ({
  ...t,
  lastActivityAt: iso(t.lastActivityAt),
  createdAt: iso(t.createdAt),
})
const toThread = (t: community.ThreadDetail): ThreadDto => ({
  ...t,
  lastActivityAt: iso(t.lastActivityAt),
  createdAt: iso(t.createdAt),
  posts: t.posts.map((p) => ({ ...p, createdAt: iso(p.createdAt) })),
})
const toUnanswered = (q: community.UnansweredQuestion): UnansweredQuestionDto => ({
  ...q,
  createdAt: iso(q.createdAt),
})
const toReport = (r: community.ReportView): ReportDto => ({ ...r, createdAt: iso(r.createdAt) })

export const communityRouter = {
  listThreads: authed.community.listThreads.handler(async ({ context, input }) => {
    const page = await community.listThreads(context.ctx, {
      courseId: input.courseId,
      scope:
        input.scopeType && input.scopeId ? { type: input.scopeType, id: input.scopeId } : undefined,
      filter: input.filter,
      page: input.page,
    })
    return { ...page, items: page.items.map(toSummary) }
  }),
  getThread: authed.community.getThread.handler(async ({ context, input }) =>
    toThread(await community.getThread(context.ctx, input.threadId)),
  ),
  createThread: authed.community.createThread.handler(async ({ context, input }) =>
    toThread(await community.createThread(context.ctx, input)),
  ),
  reply: authed.community.reply.handler(async ({ context, input }) =>
    toThread(await community.reply(context.ctx, input)),
  ),
  react: authed.community.react.handler(({ context, input }) =>
    community.react(context.ctx, input),
  ),
  acceptAnswer: authed.community.acceptAnswer.handler(async ({ context, input }) =>
    toThread(await community.acceptAnswer(context.ctx, input)),
  ),
  deleteOwn: authed.community.deleteOwn.handler(async ({ context, input }) => {
    await community.deleteOwn(context.ctx, input)
    return ok
  }),
  report: authed.community.report.handler(async ({ context, input }) => {
    await community.report(context.ctx, input)
    return ok
  }),
  moderate: authed.community.moderate.handler(async ({ context, input }) => {
    await community.moderate(context.ctx, input)
    return ok
  }),
  unanswered: authed.community.unanswered.handler(async ({ context }) => ({
    items: (await community.unansweredQuestions(context.ctx)).map(toUnanswered),
  })),
}

export const adminModerationRouter = {
  reports: authed.admin.moderation.reports.handler(async ({ context }) => ({
    items: (await community.listOpenReports(context.ctx)).map(toReport),
  })),
  handle: authed.admin.moderation.handle.handler(async ({ context, input }) => {
    await community.handleReport(context.ctx, input)
    return ok
  }),
}
