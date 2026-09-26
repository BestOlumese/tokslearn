import { Upload, type UploadOptions } from 'tus-js-client'

/**
 * Resumable upload settings for lesson videos (docs/09 §2): 8 MB chunks and retries with growing
 * delays, so a dropped connection on mobile data resumes from the last byte the server has.
 */
export const VIDEO_CHUNK_BYTES = 8 * 1024 * 1024
export const VIDEO_RETRY_DELAYS = [0, 3000, 10_000, 30_000, 60_000, 120_000]

export function createVideoUpload(
  input: Blob | File | Buffer,
  auth: { endpoint: string; headers: Readonly<Record<string, string>> },
  meta: { filetype: string; title: string },
  callbacks: Pick<UploadOptions, 'onProgress' | 'onError' | 'onSuccess'>,
  tuning: { chunkSize?: number; retryDelays?: number[] } = {},
): Upload {
  return new Upload(input, {
    endpoint: auth.endpoint,
    headers: { ...auth.headers },
    metadata: meta,
    chunkSize: tuning.chunkSize ?? VIDEO_CHUNK_BYTES,
    retryDelays: tuning.retryDelays ?? VIDEO_RETRY_DELAYS,
    // Each upload gets a fresh Bunny video id and signature, so a stored fingerprint could only
    // point at an expired upload.
    storeFingerprintForResuming: false,
    ...callbacks,
  })
}
