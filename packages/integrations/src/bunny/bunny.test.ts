import { createHash, createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBunnyStream } from './client'

const config = {
  libraryId: '1234',
  apiKey: 'api-key',
  tokenAuthKey: 'token-key',
  cdnHostname: 'vz-test.b-cdn.net',
  webhookSecret: 'read-only-key',
}
const bunny = createBunnyStream(config)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

afterEach(() => vi.unstubAllGlobals())

describe('bunny stream', () => {
  it('signs TUS uploads without exposing the API key', () => {
    const expiresAt = new Date('2026-10-01T00:00:00Z')
    const auth = bunny.authorizeUpload({ videoId: 'vid-1', expiresAt })
    const exp = expiresAt.getTime() / 1000
    expect(auth.headers.AuthorizationSignature).toBe(sha(`1234api-key${exp}vid-1`))
    expect(auth.headers.AuthorizationExpire).toBe(String(exp))
    expect(JSON.stringify(auth)).not.toContain('api-key')
  })

  it('builds token-authenticated playback URLs', () => {
    const expiresAt = new Date('2026-10-01T00:00:00Z')
    const exp = expiresAt.getTime() / 1000
    const { embedUrl, hlsUrl } = bunny.playbackUrls({ videoId: 'vid-1', expiresAt })
    const token = sha(`token-keyvid-1${exp}`)
    expect(embedUrl).toBe(
      `https://iframe.mediadelivery.net/embed/1234/vid-1?token=${token}&expires=${exp}`,
    )
    expect(hlsUrl).toContain(`vz-test.b-cdn.net/vid-1/playlist.m3u8?token=${token}`)
  })

  it('accepts only webhooks signed with the read-only key', () => {
    const body = JSON.stringify({ VideoLibraryId: 1234, VideoGuid: 'vid-1', Status: 3 })
    const good = createHmac('sha256', 'read-only-key').update(body).digest('hex')
    expect(bunny.verifyWebhookSignature(body, good)).toBe(true)
    expect(bunny.verifyWebhookSignature(body, good.toUpperCase())).toBe(true)
    expect(bunny.verifyWebhookSignature(`${body} `, good)).toBe(false)
    expect(bunny.verifyWebhookSignature(body, null)).toBe(false)
  })

  it('maps video status and thumbnail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: 3,
          length: 125.4,
          width: 1920,
          height: 1080,
          thumbnailFileName: 'thumbnail.jpg',
        }),
      ),
    )
    expect(await bunny.getVideo('vid-1')).toEqual({
      status: 'ready',
      durationSec: 125,
      width: 1920,
      height: 1080,
      thumbnailUrl: 'https://vz-test.b-cdn.net/vid-1/thumbnail.jpg',
    })
  })
})
