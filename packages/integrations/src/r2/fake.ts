import type { FileStorage } from './types'

export function createFakeStorage(): FileStorage & { deleted: string[] } {
  const deleted: string[] = []
  return {
    deleted,
    async presignUpload({ bucket, key, contentType }) {
      return {
        url: `https://r2.test/${bucket}/${key}?upload`,
        headers: { 'content-type': contentType },
      }
    },
    async presignDownload({ bucket, key }) {
      return `https://r2.test/${bucket}/${key}?download`
    },
    async deleteObject({ bucket, key }) {
      deleted.push(`${bucket}/${key}`)
    },
  }
}
