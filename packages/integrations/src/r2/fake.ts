import type { Bucket, FileStorage } from './types'

/** In-memory R2 stand-in. `putObject` simulates the browser's direct upload. */
export function createFakeStorage(): FileStorage & {
  deleted: string[]
  putObject(bucket: Bucket, key: string, sizeBytes: number, contentType: string): void
} {
  const deleted: string[] = []
  const objects = new Map<string, { sizeBytes: number; contentType: string }>()
  return {
    deleted,
    putObject(bucket, key, sizeBytes, contentType) {
      objects.set(`${bucket}/${key}`, { sizeBytes, contentType })
    },
    async presignUpload({ bucket, key, contentType }) {
      return {
        url: `https://r2.test/${bucket}/${key}?upload`,
        headers: { 'content-type': contentType },
      }
    },
    async presignDownload({ bucket, key }) {
      return `https://r2.test/${bucket}/${key}?download`
    },
    async headObject({ bucket, key }) {
      return objects.get(`${bucket}/${key}`) ?? null
    },
    async deleteObject({ bucket, key }) {
      objects.delete(`${bucket}/${key}`)
      deleted.push(`${bucket}/${key}`)
    },
  }
}
