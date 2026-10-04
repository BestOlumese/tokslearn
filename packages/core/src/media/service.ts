import { newId, schema } from '@tokslearn/db'
import { and, eq, inArray } from 'drizzle-orm'
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

/** Keeps a display name: no path, no control characters, at most 120 characters. */
export const cleanFilename = (name: string): string | null => {
  const base = name.split(/[\\/]/).pop() ?? ''
  const printable = [...base].filter((ch) => {
    const code = ch.codePointAt(0) ?? 0
    return code >= 0x20 && code !== 0x7f
  })
  const clean = printable.join('').trim().slice(0, 120)
  return clean || null
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
    originalName: cleanFilename(input.filename),
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

/** Short-lived download link for a private file. The caller must have checked access. */
export async function privateFileUrl(
  ctx: Ctx,
  file: { bucket: 'public' | 'private'; key: string },
  downloadName?: string,
): Promise<string> {
  return provider(ctx, 'storage').presignDownload({
    bucket: file.bucket,
    key: file.key,
    expiresInSec: 5 * 60,
    ...(downloadName ? { downloadName } : {}),
  })
}

/** Files by id for other modules (no ownership check: the caller authorizes). */
export async function getFiles(ctx: Ctx, ids: ReadonlyArray<string>) {
  if (ids.length === 0) return new Map<string, typeof files.$inferSelect>()
  const rows = await ctx.db
    .select()
    .from(files)
    .where(inArray(files.id, [...ids]))
  return new Map(rows.map((r) => [r.id, r]))
}

/**
 * Stores a file the platform made itself (certificate and statement PDFs) in the private bucket. The upload
 * happens before the row is written, so a row always points at a real object.
 */
export async function storeGeneratedFile(
  ctx: Ctx,
  input: {
    ownerId: string
    purpose: 'certificate' | 'statement'
    bytes: Uint8Array
    mime: 'application/pdf'
    originalName: string
  },
): Promise<{ id: string }> {
  const fileId = newId()
  const key = `${input.purpose}/${input.ownerId}/${fileId}.pdf`
  await provider(ctx, 'storage').uploadObject({
    bucket: 'private',
    key,
    body: input.bytes,
    contentType: input.mime,
  })
  await ctx.db.insert(files).values({
    id: fileId,
    ownerId: input.ownerId,
    bucket: 'private',
    key,
    mime: input.mime,
    sizeBytes: input.bytes.byteLength,
    originalName: cleanFilename(input.originalName),
    purpose: input.purpose,
    status: 'uploaded',
    scanStatus: 'skipped',
    uploadedAt: ctx.now,
  })
  return { id: fileId }
}

/** Deletes a generated file the platform replaced (an old certificate PDF). */
export async function removeGeneratedFile(ctx: Ctx, fileId: string): Promise<void> {
  const [file] = await ctx.db.delete(files).where(eq(files.id, fileId)).returning()
  if (file) {
    await provider(ctx, 'storage').deleteObject({ bucket: file.bucket, key: file.key })
  }
}
