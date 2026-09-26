import 'server-only'
import { AwsClient } from 'aws4fetch'
import type { Bucket, FileStorage } from './types'

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  buckets: Record<Bucket, string>
}

/** Cloudflare R2 over its S3 API, signed with aws4fetch (no AWS SDK in the bundle). */
export function createR2Storage(config: R2Config): FileStorage {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const objectUrl = (bucket: Bucket, key: string) =>
    `https://${config.accountId}.r2.cloudflarestorage.com/${config.buckets[bucket]}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`

  return {
    async presignUpload({ bucket, key, contentType, contentLength, expiresInSec }) {
      const url = new URL(objectUrl(bucket, key))
      url.searchParams.set('X-Amz-Expires', String(expiresInSec))
      const headers = { 'content-type': contentType, 'content-length': String(contentLength) }
      const signed = await aws.sign(new Request(url, { method: 'PUT', headers }), {
        aws: { signQuery: true, allHeaders: true },
      })
      // The browser sets content-length itself; it only needs to send the content type.
      return { url: signed.url, headers: { 'content-type': contentType } }
    },

    async presignDownload({ bucket, key, expiresInSec, downloadName }) {
      const url = new URL(objectUrl(bucket, key))
      url.searchParams.set('X-Amz-Expires', String(expiresInSec))
      if (downloadName) {
        url.searchParams.set(
          'response-content-disposition',
          `attachment; filename="${downloadName.replace(/["\\\r\n]/g, '')}"`,
        )
      }
      const signed = await aws.sign(new Request(url, { method: 'GET' }), {
        aws: { signQuery: true },
      })
      return signed.url
    },

    async headObject({ bucket, key }) {
      const res = await aws.fetch(objectUrl(bucket, key), { method: 'HEAD' })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`R2 HEAD failed with ${res.status}`)
      return {
        sizeBytes: Number(res.headers.get('content-length') ?? 0),
        contentType: res.headers.get('content-type'),
      }
    },

    async deleteObject({ bucket, key }) {
      const res = await aws.fetch(objectUrl(bucket, key), { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE failed with ${res.status}`)
    },
  }
}
