import { schema } from '@tokslearn/db'
import { and, asc, desc, eq, ilike, isNull } from 'drizzle-orm'
import { lessonAccess } from '../enrollments'
import type { Ctx } from '../kernel/ctx'
import { ForbiddenError, NotFoundError, ValidationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'

// Notes and bookmarks (docs/10 §4): private to the learner, only on lessons they can open.
// Foreign reads (docs/03 §3): lessons, courses, course_revisions, sections.

const { notes, bookmarks, lessons, courses, courseRevisions: revisions, sections } = schema

export const NOTE_MAX = 2000

async function requireOpenLesson(ctx: Ctx, lessonId: string): Promise<string> {
  const access = await lessonAccess(ctx, lessonId)
  if (access.reason === 'missing' || !access.courseId) throw new NotFoundError('LESSON_NOT_FOUND')
  if (!access.allowed) throw new ForbiddenError('NOT_ENROLLED')
  return access.courseId
}

const cleanBody = (body: string) => {
  const text = body.trim()
  if (text.length === 0 || text.length > NOTE_MAX) {
    throw new ValidationError([
      { path: 'body', message: `Write between 1 and ${NOTE_MAX} characters.` },
    ])
  }
  return text
}

const cleanPosition = (p: number | null | undefined) =>
  p === null || p === undefined ? null : Math.max(0, Math.floor(p))

export async function createNote(
  ctx: Ctx,
  input: { lessonId: string; positionSec?: number | null | undefined; body: string },
) {
  const actor = requireUser(ctx.actor)
  const courseId = await requireOpenLesson(ctx, input.lessonId)
  const [row] = await ctx.db
    .insert(notes)
    .values({
      userId: actor.userId,
      courseId,
      lessonId: input.lessonId,
      positionSec: cleanPosition(input.positionSec),
      body: cleanBody(input.body),
    })
    .returning()
  if (!row) throw new Error('note not inserted')
  return row
}

async function ownNote(ctx: Ctx, noteId: string) {
  const actor = requireUser(ctx.actor)
  const [row] = await ctx.db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, actor.userId)))
  if (!row) throw new NotFoundError('NOTE_NOT_FOUND')
  return row
}

export async function updateNote(ctx: Ctx, input: { noteId: string; body: string }) {
  const note = await ownNote(ctx, input.noteId)
  const [row] = await ctx.db
    .update(notes)
    .set({ body: cleanBody(input.body) })
    .where(eq(notes.id, note.id))
    .returning()
  return row ?? note
}

export async function deleteNote(ctx: Ctx, noteId: string) {
  const note = await ownNote(ctx, noteId)
  await ctx.db.delete(notes).where(eq(notes.id, note.id))
}

export interface NoteView {
  id: string
  courseId: string
  courseTitle: string
  courseSlug: string
  lessonId: string
  lessonTitle: string
  positionSec: number | null
  body: string
  createdAt: Date
}

/** The learner's notes, for one lesson, one course or all (docs/20 `/account/notes`). */
export async function listNotes(
  ctx: Ctx,
  input: {
    courseId?: string | undefined
    lessonId?: string | undefined
    q?: string | undefined
  } = {},
): Promise<NoteView[]> {
  const actor = requireUser(ctx.actor)
  const q = input.q?.trim().replace(/[%_]/g, '')
  return ctx.db
    .select({
      id: notes.id,
      courseId: notes.courseId,
      courseTitle: revisions.title,
      courseSlug: courses.slug,
      lessonId: notes.lessonId,
      lessonTitle: lessons.title,
      positionSec: notes.positionSec,
      body: notes.body,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .innerJoin(lessons, eq(lessons.id, notes.lessonId))
    .innerJoin(courses, eq(courses.id, notes.courseId))
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .innerJoin(sections, eq(sections.id, lessons.sectionId))
    .where(
      and(
        eq(notes.userId, actor.userId),
        input.courseId ? eq(notes.courseId, input.courseId) : undefined,
        input.lessonId ? eq(notes.lessonId, input.lessonId) : undefined,
        q ? ilike(notes.body, `%${q}%`) : undefined,
      ),
    )
    .orderBy(
      input.lessonId ? asc(notes.positionSec) : asc(revisions.title),
      asc(sections.position),
      asc(lessons.position),
      asc(notes.positionSec),
      desc(notes.createdAt),
    )
    .limit(1000)
}

const clock = (sec: number) => {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** Notes as Markdown: one heading per course, then per lesson, timestamps in brackets. */
export async function exportNotesMarkdown(ctx: Ctx, courseId?: string): Promise<string> {
  const list = await listNotes(ctx, { courseId })
  const out: string[] = ['# My Tokslearn notes', '']
  let course = ''
  let lesson = ''
  for (const n of list) {
    if (n.courseId !== course) {
      course = n.courseId
      lesson = ''
      out.push(`## ${n.courseTitle}`, '')
    }
    if (n.lessonId !== lesson) {
      lesson = n.lessonId
      out.push(`### ${n.lessonTitle}`, '')
    }
    out.push(
      `- ${n.positionSec !== null ? `[${clock(n.positionSec)}] ` : ''}${n.body.replace(/\n/g, '\n  ')}`,
    )
  }
  if (list.length === 0) out.push('No notes yet.')
  return `${out.join('\n').trimEnd()}\n`
}

// ── Bookmarks ────────────────────────────────────────────────────────────────────

/** Adds a bookmark, or removes it if it's already there (the `B` key). Returns the new state. */
export async function toggleBookmark(
  ctx: Ctx,
  input: { lessonId: string; positionSec?: number | null | undefined },
): Promise<{ bookmarked: boolean }> {
  const actor = requireUser(ctx.actor)
  const courseId = await requireOpenLesson(ctx, input.lessonId)
  const positionSec = cleanPosition(input.positionSec)
  const where = and(
    eq(bookmarks.userId, actor.userId),
    eq(bookmarks.lessonId, input.lessonId),
    positionSec === null ? isNull(bookmarks.positionSec) : eq(bookmarks.positionSec, positionSec),
  )
  const removed = await ctx.db.delete(bookmarks).where(where).returning({ id: bookmarks.id })
  if (removed.length > 0) return { bookmarked: false }
  await ctx.db
    .insert(bookmarks)
    .values({ userId: actor.userId, courseId, lessonId: input.lessonId, positionSec })
    .onConflictDoNothing()
  return { bookmarked: true }
}

export async function listBookmarks(ctx: Ctx, courseId: string) {
  const actor = requireUser(ctx.actor)
  return ctx.db
    .select({
      id: bookmarks.id,
      lessonId: bookmarks.lessonId,
      lessonTitle: lessons.title,
      positionSec: bookmarks.positionSec,
      createdAt: bookmarks.createdAt,
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(lessons.id, bookmarks.lessonId))
    .innerJoin(sections, eq(sections.id, lessons.sectionId))
    .where(and(eq(bookmarks.userId, actor.userId), eq(bookmarks.courseId, courseId)))
    .orderBy(asc(sections.position), asc(lessons.position), asc(bookmarks.positionSec))
}
