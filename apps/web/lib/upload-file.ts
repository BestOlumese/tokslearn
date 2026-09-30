import { api } from './orpc'

/** Presigned upload to R2, then confirm (docs/09 §5). Returns the file id and public URL. */
export async function uploadFile(
  file: File,
  purpose: 'avatar' | 'cover' | 'resource' | 'exam_evidence',
) {
  const upload = await api.media.createFileUpload({
    purpose,
    filename: file.name,
    mime: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  })
  let put: Response
  try {
    put = await fetch(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: file })
  } catch {
    // The storage host refused the browser (usually its CORS rules) or the network dropped.
    throw new Error('upload_failed')
  }
  if (!put.ok) throw new Error('upload_failed')
  return api.media.completeFileUpload({ fileId: upload.fileId })
}
