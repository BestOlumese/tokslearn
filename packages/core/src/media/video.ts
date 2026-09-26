import { newId, schema } from '@tokslearn/db'
import { ProviderError } from '@tokslearn/integrations/bunny'
import { eq, inArray } from 'drizzle-orm'
import { type Ctx, provider } from '../kernel/ctx'
import { ExternalServiceError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { formatBytes, PLAYBACK_TTL_SEC, VIDEO_MAX_BYTES, VIDEO_UPLOAD_TTL_SEC } from './rules'

// Bunny Stream video assets (docs/09 §1–3). Callers (courses) authorize access to the lesson;
// this module owns the video_assets table and the provider calls.

const { videoAssets } = schema
export type VideoAsset = typeof videoAssets.$inferSelect

async function videoCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new ExternalServiceError('VIDEO_PROVIDER_UNAVAILABLE', {}, { cause: error })
    }
    throw error
  }
}

/**
 * Creates the video at Bunny and returns signed TUS headers (the API key stays on the server).
 * Call outside a transaction: it talks to Bunny.
 */
export async function createVideoAsset(
  ctx: Ctx,
  input: { title: string; filename: string; sizeBytes: number; mime: string },
) {
  const user = requireUser(ctx.actor)
  if (!input.mime.startsWith('video/')) {
    throw new RuleViolationError('UNSUPPORTED_FILE_TYPE', {
      types: 'MP4, MOV, WebM or other video',
    })
  }
  if (input.sizeBytes > VIDEO_MAX_BYTES) {
    throw new RuleViolationError('UPLOAD_TOO_LARGE', { limit: formatBytes(VIDEO_MAX_BYTES) })
  }
  const video = provider(ctx, 'video')
  const { videoId } = await videoCall(() => video.createVideo({ title: input.title }))
  const [asset] = await ctx.db
    .insert(videoAssets)
    .values({
      id: newId(),
      ownerId: user.userId,
      libraryId: video.libraryId,
      providerVideoId: videoId,
      filename: input.filename.slice(0, 200),
      sizeBytes: input.sizeBytes,
    })
    .returning()
  if (!asset) throw new Error('video asset insert returned nothing')
  const upload = video.authorizeUpload({
    videoId,
    expiresAt: new Date(ctx.now.getTime() + VIDEO_UPLOAD_TTL_SEC * 1000),
  })
  return { asset, upload }
}

export async function getVideoAssets(ctx: Ctx, ids: ReadonlyArray<string>) {
  if (ids.length === 0) return new Map<string, VideoAsset>()
  const rows = await ctx.db
    .select()
    .from(videoAssets)
    .where(inArray(videoAssets.id, [...ids]))
  return new Map(rows.map((r) => [r.id, r]))
}

export async function getVideoAssetByProviderId(ctx: Ctx, providerVideoId: string) {
  const [row] = await ctx.db
    .select()
    .from(videoAssets)
    .where(eq(videoAssets.providerVideoId, providerVideoId))
  return row ?? null
}

/**
 * Re-reads a video from Bunny and stores its status, duration and thumbnail. Used by the webhook
 * job and by the studio's "check again" button. Never trusts webhook bodies (docs/06 §7).
 */
export async function refreshVideoAsset(ctx: Ctx, assetId: string) {
  const [asset] = await ctx.db.select().from(videoAssets).where(eq(videoAssets.id, assetId))
  if (!asset) throw new NotFoundError('VIDEO_NOT_FOUND')
  if (asset.status === 'ready' || asset.status === 'failed') return { asset, changed: false }

  const info = await videoCall(() => provider(ctx, 'video').getVideo(asset.providerVideoId))
  const status = !info ? 'failed' : info.status
  if (status === 'processing' && asset.status === 'processing') return { asset, changed: false }
  const [updated] = await ctx.db
    .update(videoAssets)
    .set({
      status,
      ...(info && status === 'ready'
        ? {
            durationSec: info.durationSec,
            width: info.width,
            height: info.height,
            thumbnailUrl: info.thumbnailUrl,
            readyAt: ctx.now,
          }
        : {}),
      ...(status === 'failed' ? { error: info ? 'encoding_failed' : 'not_found_at_provider' } : {}),
    })
    .where(eq(videoAssets.id, asset.id))
    .returning()
  return { asset: updated ?? asset, changed: true }
}

/** Signed embed URL for previews. The caller must have checked the viewer may watch it. */
export function videoPreviewUrl(ctx: Ctx, asset: VideoAsset): string | null {
  if (asset.status !== 'ready') return null
  return provider(ctx, 'video').playbackUrls({
    videoId: asset.providerVideoId,
    expiresAt: new Date(ctx.now.getTime() + PLAYBACK_TTL_SEC * 1000),
  }).embedUrl
}
