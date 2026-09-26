import { newId, schema } from '@tokslearn/db'
import { and, eq } from 'drizzle-orm'
import { type Ctx, provider } from '../kernel/ctx'
import { ConflictError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { formatBytes, type UploadPurpose, uploadRules } from './rules'

const { files } = schema
const UPLOAD_TTL_SEC = 5 * 60

export interface FileUpload {
  fileId: string
  uploadUrl: string
  headers: Readonly<Record<string, string>>
  expiresAt: Date
}

/** Step 1: validate type and size, reserve a key, return a presigned PUT (docs/09 §5). */
export async function createFileUpload(
  ctx: Ctx,
  input: { purpose: UploadPurpose; filename: string; mime: string; sizeBytes: number },
): Promise<FileUpload> {
  const user = requireUser(ctx.actor)
  const rule = uploadRules[input.purpose]
  const ext = rule.mimes[input.mime]
  if (!ext) {
    const types = Object.values(rule.mimes)
      .map((e) => e.toUpperCase())
      .join(', ')
    throw new RuleViolationError('UNSUPPORTED_FILE_TYPE', { types })
  }
  if (input.sizeBytes > rule.maxBytes) {
    throw new RuleViolationError('UPLOAD_TOO_LARGE', { limit: formatBytes(rule.maxBytes) })
  }

  const fileId = newId()
  const key = `${input.purpose}/${user.userId}/${fileId}.${ext}`
  await ctx.db.insert(files).values({
    id: fileId,
    ownerId: user.userId,
    bucket: rule.bucket,
    key,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    purpose: input.purpose,
  })
  const signed = await provider(ctx, 'storage').presignUpload({
    bucket: rule.bucket,
    key,
    contentType: input.mime,
    contentLength: input.sizeBytes,
    expiresInSec: UPLOAD_TTL_SEC,
  })
  return {
    fileId,
    uploadUrl: signed.url,
    headers: signed.headers,
    expiresAt: new Date(ctx.now.getTime() + UPLOAD_TTL_SEC * 1000),
  }
}

/** Step 2: confirm the object exists with the declared size, then mark it usable. */
export async function completeFileUpload(ctx: Ctx, fileId: string) {
  const user = requireUser(ctx.actor)
  const [file] = await ctx.db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.ownerId, user.userId)))
  if (!file) throw new NotFoundError('FILE_NOT_FOUND')
  if (file.status === 'uploaded') return file

  const head = await provider(ctx, 'storage').headObject({ bucket: file.bucket, key: file.key })
  if (!head) throw new ConflictError('FILE_NOT_FOUND', { reason: 'not_uploaded' })
  if (head.sizeBytes !== file.sizeBytes) {
    throw new RuleViolationError('UPLOAD_TOO_LARGE', { limit: formatBytes(file.sizeBytes) })
  }

  // v1 has no virus scanner: images are type- and size-checked, so mark as skipped (docs/09 §5).
  const [updated] = await ctx.db
    .update(files)
    .set({ status: 'uploaded', scanStatus: 'skipped', uploadedAt: ctx.now })
    .where(eq(files.id, file.id))
    .returning()
  return updated ?? file
}

/**
 * For other modules: an uploaded file the actor owns with the expected purpose, or FILE_NOT_FOUND.
 * Never reveals whether someone else's file exists.
 */
export async function getOwnedUploadedFile(ctx: Ctx, fileId: string, purpose: UploadPurpose) {
  const user = requireUser(ctx.actor)
  const [file] = await ctx.db
    .select({ id: files.id, key: files.key, bucket: files.bucket })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.ownerId, user.userId),
        eq(files.purpose, purpose),
        eq(files.status, 'uploaded'),
      ),
    )
  if (!file) throw new NotFoundError('FILE_NOT_FOUND')
  return file
}

/** Public URL for objects in the public bucket, served from the CDN domain. */
export function publicFileUrl(ctx: Ctx, key: string | null): string | null {
  const cdn = ctx.providers.urls?.cdn
  if (!key || !cdn) return null
  return `${cdn.replace(/\/$/, '')}/${key}`
}
