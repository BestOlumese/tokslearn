import type { LearnOutlineDto, NoteDto } from '@tokslearn/contract'
import * as courses from '@tokslearn/core/courses'
import * as engagement from '@tokslearn/core/engagement'
import * as enrollments from '@tokslearn/core/enrollments'
import * as learning from '@tokslearn/core/learning'
import { authed } from '../base'

// Player, progress, notes, bookmarks, streaks, badges, and the studio's drip and learners pages
// (docs/06 §5, docs/10 §2–4). Thin: auth → validate → core → DTO with ISO dates.

const iso = (d: Date) => d.toISOString()
const isoN = (d: Date | null) => (d ? d.toISOString() : null)

const toOutline = (o: learning.LearnOutline): LearnOutlineDto => ({
  ...o,
  sections: o.sections.map((s) => ({
    ...s,
    lessons: s.lessons.map((l) => ({ ...l, unlocksAt: isoN(l.unlocksAt) })),
  })),
})

const toNote = (n: engagement.NoteView): NoteDto => ({ ...n, createdAt: iso(n.createdAt) })

export const learnPlayerRouter = {
  getCourseOutline: authed.learn.getCourseOutline.handler(async ({ context, input }) =>
    toOutline(await learning.getCourseOutline(context.ctx, input.courseSlug)),
  ),
  getLesson: authed.learn.getLesson.handler(async ({ context, input }) => {
    const l = await learning.getLesson(context.ctx, input.lessonId)
    return {
      ...l,
      refund: l.refund
        ? { state: l.refund.state, until: l.refund.state === 'open' ? iso(l.refund.until) : null }
        : null,
    }
  }),
  playback: authed.learn.playback.handler(async ({ context, input }) => {
    const p = await learning.getPlayback(context.ctx, input.lessonId)
    return { ...p, expiresAt: iso(p.expiresAt) }
  }),
  resourceDownload: authed.learn.resourceDownload.handler(({ context, input }) =>
    learning.downloadResource(context.ctx, input),
  ),
  continue: authed.learn.continue.handler(({ context }) => learning.continueLearning(context.ctx)),
}

export const progressRouter = {
  heartbeat: authed.progress.heartbeat.handler(({ context, input }) =>
    learning.heartbeat(context.ctx, input),
  ),
  syncBatch: authed.progress.syncBatch.handler(({ context, input }) =>
    learning.syncBatch(
      context.ctx,
      input.beats.map((b) => ({ ...b, occurredAt: new Date(b.occurredAt) })),
    ),
  ),
  getCourse: authed.progress.getCourse.handler(async ({ context, input }) => {
    const p = await learning.getCourseProgress(context.ctx, input.courseId)
    return {
      ...p,
      lessons: p.lessons.map((l) => ({ ...l, completedAt: isoN(l.completedAt) })),
    }
  }),
  markComplete: authed.progress.markComplete.handler(({ context, input }) =>
    learning.markLessonComplete(context.ctx, input.lessonId),
  ),
}

export const notesRouter = {
  list: authed.notes.list.handler(async ({ context, input }) => ({
    items: (await engagement.listNotes(context.ctx, input)).map(toNote),
  })),
  create: authed.notes.create.handler(async ({ context, input }) => {
    const n = await engagement.createNote(context.ctx, input)
    return { id: n.id, positionSec: n.positionSec, body: n.body }
  }),
  update: authed.notes.update.handler(async ({ context, input }) => {
    const n = await engagement.updateNote(context.ctx, input)
    return { id: n.id, body: n.body }
  }),
  delete: authed.notes.delete.handler(async ({ context, input }) => {
    await engagement.deleteNote(context.ctx, input.noteId)
    return { ok: true as const }
  }),
  export: authed.notes.export.handler(async ({ context, input }) => ({
    markdown: await engagement.exportNotesMarkdown(context.ctx, input.courseId),
    filename: 'tokslearn-notes.md',
  })),
}

export const bookmarksRouter = {
  list: authed.bookmarks.list.handler(async ({ context, input }) => ({
    items: (await engagement.listBookmarks(context.ctx, input.courseId)).map((b) => ({
      ...b,
      createdAt: iso(b.createdAt),
    })),
  })),
  toggle: authed.bookmarks.toggle.handler(({ context, input }) =>
    engagement.toggleBookmark(context.ctx, input),
  ),
}

export const engagementRouter = {
  getStreak: authed.engagement.getStreak.handler(({ context }) =>
    engagement.getStreak(context.ctx),
  ),
  listBadges: authed.engagement.listBadges.handler(async ({ context }) => ({
    items: (await engagement.listBadges(context.ctx)).map((b) => ({
      ...b,
      awardedAt: isoN(b.awardedAt),
    })),
  })),
}

export const studioDripRouter = {
  get: authed.studio.drip.get.handler(({ context, input }) =>
    courses.getDripSettings(context.ctx, input.courseId),
  ),
  update: authed.studio.drip.update.handler(({ context, input }) =>
    courses.updateDripSettings(context.ctx, input),
  ),
}

export const studioLearnersRouter = {
  list: authed.studio.learners.list.handler(async ({ context, input }) => {
    const page = await enrollments.listCourseLearners(context.ctx, input)
    return {
      ...page,
      items: page.items.map((l) => ({
        ...l,
        enrolledAt: iso(l.enrolledAt),
        lastActiveAt: isoN(l.lastActiveAt),
      })),
    }
  }),
}
