// Client calls for the course player (docs/09 §3–4). Plain fetch against the REST API, like the
// shop helpers: the player shell stays light so taps respond fast on mid-range phones (INP).
// No server-only imports here.

import type {
  AttemptDto,
  CourseCertificateDto,
  MyAssignmentDto,
  QuizIntroDto,
  RichTextDoc,
} from '@tokslearn/contract'
import { ShopError as LearnErrorClass, shopApi } from './shop'

export { ShopError as LearnError } from './shop'

export interface Playback {
  embedUrl: string
  hlsUrl: string
  expiresAt: string
  resumeAt: number
}

export interface BeatResult {
  recorded: boolean
  status: 'not_started' | 'in_progress' | 'completed'
  positionSec: number
  completedNow: boolean
  courseProgressPct: number | null
  streakExtendedTo: number | null
}

export interface Beat {
  lessonId: string
  positionSec: number
  watchedDeltaSec: number
}

export interface NoteItem {
  id: string
  lessonId: string
  positionSec: number | null
  body: string
  createdAt: string
}

export interface BookmarkItem {
  id: string
  lessonId: string
  lessonTitle: string
  positionSec: number | null
}

export const playback = (lessonId: string) =>
  shopApi<Playback>(`/learn/lessons/${lessonId}/playback`)

export const heartbeat = (beat: Beat) =>
  shopApi<BeatResult>('/progress/heartbeat', { method: 'POST', body: beat })

/**
 * The last beat as the page goes away. `keepalive` lets it outlive the page like `sendBeacon`,
 * and unlike `sendBeacon` it can send JSON with the right content type.
 */
export function heartbeatOnLeave(beat: Beat): void {
  try {
    void fetch('/api/v1/progress/heartbeat', {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(beat),
    }).catch(() => undefined)
  } catch {
    // The page is closing; nothing useful to do.
  }
}

export const markComplete = (lessonId: string) =>
  shopApi<BeatResult>(`/progress/lessons/${lessonId}/complete`, { method: 'POST', body: {} })

export const downloadFile = (lessonId: string, resourceId: string, confirmed: boolean) =>
  shopApi<{ url: string; filename: string }>(
    `/learn/lessons/${lessonId}/resources/${resourceId}/download`,
    { method: 'POST', body: { confirmed } },
  )

export const listNotes = (lessonId: string) =>
  shopApi<{ items: NoteItem[] }>(`/notes?lessonId=${lessonId}`)

export const createNote = (input: { lessonId: string; positionSec: number | null; body: string }) =>
  shopApi<{ id: string; positionSec: number | null; body: string }>('/notes', {
    method: 'POST',
    body: input,
  })

export const updateNote = (noteId: string, body: string) =>
  shopApi<{ id: string; body: string }>(`/notes/${noteId}`, { method: 'POST', body: { body } })

export const deleteNote = (noteId: string) =>
  shopApi<{ ok: true }>(`/notes/${noteId}/delete`, { method: 'POST', body: {} })

export const listBookmarks = (courseId: string) =>
  shopApi<{ items: BookmarkItem[] }>(`/bookmarks?courseId=${courseId}`)

export const toggleBookmark = (lessonId: string, positionSec: number | null) =>
  shopApi<{ bookmarked: boolean }>('/bookmarks/toggle', {
    method: 'POST',
    body: { lessonId, positionSec },
  })

/** "12:40" or "1:02:05". */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`
}

// ── Player events ────────────────────────────────────────────────────────────────────────────
// The video, keyboard shortcuts and notes panel are separate islands. They share the current
// time and "add a note here" through window events instead of a store.

export const NOTE_EVENT = 'tl:note'
export const SEEK_EVENT = 'tl:seek'
export const BOOKMARKS_EVENT = 'tl:bookmarks'

let currentTime: number | null = null

/** Seconds into the video now playing on this page, or null (no video, or not started). */
export const videoTime = (): number | null =>
  currentTime === null ? null : Math.floor(currentTime)

export function publishTime(sec: number | null): void {
  currentTime = sec
}

/** Asks the notes panel to open with a note at the given time. */
export function requestNote(positionSec: number | null): void {
  window.dispatchEvent(new CustomEvent(NOTE_EVENT, { detail: { positionSec } }))
}

/** Asks the video on this page to jump to a moment (a note's or bookmark's time). */
export function requestSeek(positionSec: number): void {
  window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: { positionSec } }))
}

// ── Quizzes, exams, assignments (docs/10 §5–7) ──────────────────────────────────────────────
// Types come from the contract (type-only: no runtime cost).

export type { AttemptDto, CourseCertificateDto, MyAssignmentDto, QuizIntroDto }

export const myCourseCertificate = (courseId: string) =>
  shopApi<CourseCertificateDto>(`/me/courses/${courseId}/certificate`)

export const quizIntro = (lessonId: string) =>
  shopApi<QuizIntroDto>(`/learn/lessons/${lessonId}/quiz`)

export const startAttempt = (lessonId: string, exam: boolean) =>
  exam
    ? shopApi<AttemptDto>('/exams/start', { method: 'POST', body: { lessonId, confirmed: true } })
    : shopApi<AttemptDto>('/quizzes/start', { method: 'POST', body: { lessonId } })

export const getAttempt = (attemptId: string) =>
  shopApi<AttemptDto>(`/quizzes/attempts/${attemptId}`)

export const saveAttemptAnswer = (
  exam: boolean,
  attemptId: string,
  questionId: string,
  answer: unknown,
) =>
  shopApi<{ savedAt: string }>(`/${exam ? 'exams' : 'quizzes'}/attempts/${attemptId}/answers`, {
    method: 'POST',
    body: { questionId, answer },
  })

export const submitAttempt = (exam: boolean, attemptId: string) =>
  shopApi<AttemptDto>(`/${exam ? 'exams' : 'quizzes'}/attempts/${attemptId}/submit`, {
    method: 'POST',
    body: {},
  })

/** Integrity signals (exams): fire and forget; recorded, never blocking. */
export function logIntegrity(
  attemptId: string,
  kind: 'focus_loss' | 'fullscreen_exit' | 'paste',
  durationMs?: number,
) {
  void fetch(`/api/v1/exams/attempts/${attemptId}/events`, {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind,
      ...(durationMs !== undefined ? { durationMs: Math.round(durationMs) } : {}),
    }),
  }).catch(() => undefined)
}

export const getMyAssignment = (lessonId: string) =>
  shopApi<MyAssignmentDto>(`/learn/lessons/${lessonId}/assignment`)

export const saveAssignmentDraft = (input: {
  lessonId: string
  text: RichTextDoc | null
  fileIds: string[]
  link: string | null
}) => shopApi<{ savedAt: string }>('/assignments/draft', { method: 'POST', body: input })

export const submitAssignment = (lessonId: string) =>
  shopApi<MyAssignmentDto>('/assignments/submit', { method: 'POST', body: { lessonId } })

export const myAssignmentFile = (lessonId: string, fileId: string) =>
  shopApi<{ url: string; filename: string }>(`/assignments/files/${fileId}?lessonId=${lessonId}`)

/** Uploads one file of the learner's work: presigned PUT to storage, then confirm. */
export async function uploadSubmissionFile(file: File): Promise<string> {
  const up = await shopApi<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>(
    '/media/uploads',
    {
      method: 'POST',
      body: {
        purpose: 'assignment_submission',
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      },
    },
  )
  let put: Response
  try {
    put = await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body: file })
  } catch {
    throw new LearnErrorClass(
      'UPLOAD_FAILED',
      'The upload didn’t finish. Check your connection and try again.',
    )
  }
  if (!put.ok) throw new LearnErrorClass('UPLOAD_FAILED', 'The upload didn’t finish. Try again.')
  await shopApi(`/media/uploads/${up.fileId}/complete`, { method: 'POST', body: {} })
  return up.fileId
}
