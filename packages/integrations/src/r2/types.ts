/** File storage boundary (Cloudflare R2, S3 API). Presigned URLs only (docs/17 §1.5). */
export type Bucket = 'public' | 'private'

export interface FileStorage {
  /**
   * Presigned PUT. Content type and exact length are part of the signature, so the browser can
   * only upload the file it declared (docs/09 §5).
   */
  presignUpload(input: {
    bucket: Bucket
    key: string
    contentType: string
    contentLength: number
    expiresInSec: number
  }): Promise<{ url: string; headers: Readonly<Record<string, string>> }>
  presignDownload(input: {
    bucket: Bucket
    key: string
    expiresInSec: number
    downloadName?: string
  }): Promise<string>
  /** Size and type of an uploaded object, or null if it does not exist. */
  headObject(input: {
    bucket: Bucket
    key: string
  }): Promise<{ sizeBytes: number; contentType: string | null } | null>
  deleteObject(input: { bucket: Bucket; key: string }): Promise<void>
}
