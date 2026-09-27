import * as media from '@tokslearn/core/media'
import { authed } from '../base'
import { createPromoVideoUploadHandler, createVideoUploadHandler } from './studio'

export const mediaRouter = {
  createFileUpload: authed.media.createFileUpload.handler(async ({ context, input }) => {
    const upload = await media.createFileUpload(context.ctx, input)
    return {
      fileId: upload.fileId,
      uploadUrl: upload.uploadUrl,
      headers: { ...upload.headers },
      expiresAt: upload.expiresAt.toISOString(),
    }
  }),

  completeFileUpload: authed.media.completeFileUpload.handler(async ({ context, input }) => {
    const file = await media.completeFileUpload(context.ctx, input.fileId)
    return {
      fileId: file.id,
      url: file.bucket === 'public' ? media.publicFileUrl(context.ctx, file.key) : null,
    }
  }),

  createVideoUpload: createVideoUploadHandler,
  createPromoVideoUpload: createPromoVideoUploadHandler,
}
