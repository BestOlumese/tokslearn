import { api } from './orpc'

/** Presigned upload to R2, then confirm (docs/09 §5). Returns the file id and public URL. */
export async function uploadFile(file: File, purpose: 'avatar' | 'cover' | 'resource') {
  const upload = await api.media.createFileUpload({
    purpose,
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  })
  const put = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: file })
  if (!put.ok) throw new Error('upload_failed')
  return api.media.completeFileUpload({ fileId: upload.fileId })
}
