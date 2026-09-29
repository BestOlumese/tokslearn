import { schema } from '@tokslearn/db'
import { and, eq } from 'drizzle-orm'
import { track } from '../analytics'
import { markPurchaseConsumed, refundablePurchase } from '../commerce'
import { lessonAccess } from '../enrollments'
import { isUser } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { ForbiddenError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { getFiles, getVideoAssets, privateFileUrl, videoPlayback } from '../media'
import { downloadName, lessonLocked } from './outline'
import { markLessonComplete } from './progress'

// Signed media for the player (docs/09 §3, docs/08 §7). Nothing is handed out without
// enrollments.lessonAccess saying yes; links expire (video 2 h, files 5 min).
// Foreign reads (docs/03 §3): lessons, lesson_resources, lesson_progress.

const { lessons, lessonResources, lessonProgress, consumptionEvents } = schema

/**
 * Stopped this close to the end, start from the top instead of resuming: the last 15 s, or the
 * last 10% for short videos (a 10 s clip resumes unless stopped in its final second).
 */
export const resumeTail = (durationSec: number) =>
  Math.min(15, Math.max(1, Math.floor(durationSec * 0.1)))

async function allowedLesson(ctx: Ctx, lessonId: string) {
  const access = await lessonAccess(ctx, lessonId)
  if (access.reason === 'missing') throw new NotFoundError('LESSON_NOT_FOUND')
  if (access.reason === 'revoked') throw new ForbiddenError('ENROLLMENT_REVOKED')
  if (access.reason === 'locked' && access.unlocksAt) throw lessonLocked(access.unlocksAt)
  if (!access.allowed) throw new ForbiddenError('NOT_ENROLLED')
  const [lesson] = await ctx.db.select().from(lessons).where(eq(lessons.id, lessonId))
  if (!lesson) throw new NotFoundError('LESSON_NOT_FOUND')
  return { lesson, access }
}

export interface Playback {
  embedUrl: string
  hlsUrl: string
  expiresAt: Date
  /** Where to start: the saved position, unless the lesson was finished or nearly so. */
  resumeAt: number
}

/** `learn.playback`: a signed Bunny embed and HLS URL for a video lesson the viewer may open. */
export async function getPlayback(ctx: Ctx, lessonId: string): Promise<Playback> {
  const { lesson } = await allowedLesson(ctx, lessonId)
  if (lesson.type !== 'video' || !lesson.videoAssetId) throw new NotFoundError('VIDEO_NOT_FOUND')
  const asset = (await getVideoAssets(ctx, [lesson.videoAssetId])).get(lesson.videoAssetId)
  if (!asset) throw new NotFoundError('VIDEO_NOT_FOUND')
  const urls = videoPlayback(ctx, asset)
  if (!urls) throw new RuleViolationError('VIDEO_NOT_READY')
  let resumeAt = 0
  if (isUser(ctx.actor)) {
    const [p] = await ctx.db
      .select({ position: lessonProgress.positionSec, status: lessonProgress.status })
      .from(lessonProgress)
      .where(
        and(eq(lessonProgress.userId, ctx.actor.userId), eq(lessonProgress.lessonId, lesson.id)),
      )
    const nearEnd =
      lesson.durationSec > 0 &&
      (p?.position ?? 0) >= lesson.durationSec - resumeTail(lesson.durationSec)
    resumeAt = p && p.status !== 'completed' && !nearEnd ? p.position : 0
  }
  return { ...urls, resumeAt }
}

/**
 * `learn.resourceDownload`: a 5-minute link to one file. An important file on a purchase that can
 * still be refunded needs `confirmed: true` (DOWNLOAD_CONFIRM_REQUIRED otherwise); downloading it
 * ends the refund right and releases the instructor's earning (docs/08 §7).
 */
export async function downloadResource(
  ctx: Ctx,
  input: { lessonId: string; resourceId: string; confirmed?: boolean | undefined },
): Promise<{ url: string; filename: string }> {
  const { lesson, access } = await allowedLesson(ctx, input.lessonId)
  const [resource] = await ctx.db
    .select()
    .from(lessonResources)
    .where(and(eq(lessonResources.id, input.resourceId), eq(lessonResources.lessonId, lesson.id)))
  if (!resource) throw new NotFoundError('RESOURCE_NOT_FOUND')
  const file = (await getFiles(ctx, [resource.fileId])).get(resource.fileId)
  if (!file) throw new NotFoundError('RESOURCE_NOT_FOUND')

  const learner = access.reason === 'enrolled' && isUser(ctx.actor) ? ctx.actor : null
  if (learner && resource.isImportant) {
    const purchase = await refundablePurchase(ctx, {
      userId: learner.userId,
      courseId: lesson.courseId,
    })
    if (purchase && !input.confirmed) {
      throw new RuleViolationError('DOWNLOAD_CONFIRM_REQUIRED', { resourceId: resource.id })
    }
  }
  if (learner) {
    await ctx.db.insert(consumptionEvents).values({
      userId: learner.userId,
      courseId: lesson.courseId,
      kind: 'resource_download',
      refId: resource.id,
      occurredAt: ctx.now,
      ipHash: ctx.ipHash,
    })
    if (resource.isImportant) {
      await markPurchaseConsumed(ctx, {
        userId: learner.userId,
        courseId: lesson.courseId,
        reason: 'important_download',
      })
    }
    void track(ctx, 'resource_downloaded', { is_important: resource.isImportant })
    // A file lesson is done once the learner has taken one of its files (ADR-034).
    if (lesson.type === 'resource') await markLessonComplete(ctx, lesson.id)
  }
  const filename = downloadName(resource.title, file.key)
  return { url: await privateFileUrl(ctx, file, filename), filename }
}
