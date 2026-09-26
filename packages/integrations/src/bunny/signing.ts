import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex')

/** TUS upload signature: SHA256(library_id + api_key + expiration_time + video_id). */
export const tusSignature = (
  libraryId: string,
  apiKey: string,
  expiresSec: number,
  videoId: string,
) => sha256Hex(`${libraryId}${apiKey}${expiresSec}${videoId}`)

/** Embed/HLS token authentication: SHA256(token_security_key + video_id + expiration). */
export const playbackToken = (tokenKey: string, videoId: string, expiresSec: number) =>
  sha256Hex(`${tokenKey}${videoId}${expiresSec}`)

export function isValidBunnySignature(
  secret: string,
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature || !secret) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature.toLowerCase(), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}
