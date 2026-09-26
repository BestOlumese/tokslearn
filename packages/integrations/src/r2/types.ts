/** File storage boundary (Cloudflare R2, S3 API). Presigned URLs only (docs/17 §1.5). */
export type Bucket = 'public' | 'private'

export interface FileStorage {
  presignUpload(input: {
    bucket: Bucket
    key: string
    contentType: string
    maxBytes: number
    expiresInSec: number
  }): Promise<{ url: string; headers: Readonly<Record<string, string>> }>
  presignDownload(input: {
    bucket: Bucket
    key: string
    expiresInSec: number
    downloadName?: string
  }): Promise<string>
  deleteObject(input: { bucket: Bucket; key: string }): Promise<void>
}
