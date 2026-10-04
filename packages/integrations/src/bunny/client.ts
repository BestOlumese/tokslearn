import 'server-only'
import { ProviderError, providerJson } from '../shared/http'
import { isValidBunnySignature, playbackToken, tusSignature } from './signing'
import type { VideoInfo, VideoProvider, VideoStatus } from './types'

const API = 'https://video.bunnycdn.com'

export interface BunnyConfig {
  libraryId: string
  apiKey: string
  /** Token Authentication key from the library's Security settings. */
  tokenAuthKey: string
  /** e.g. vz-abc123.b-cdn.net */
  cdnHostname: string
  /** The library's read-only API key; Bunny signs webhooks with it. */
  webhookSecret: string
}

// Bunny video status: 0 queued, 1 processing, 2 encoding, 3 finished, 4 resolution finished,
// 5 failed, 6–8 presigned upload states.
function mapStatus(code: number): VideoStatus {
  if (code === 3 || code === 4) return 'ready'
  if (code === 5 || code === 8) return 'failed'
  return 'processing'
}

export function createBunnyStream(config: BunnyConfig): VideoProvider {
  const headers = { accesskey: config.apiKey, 'content-type': 'application/json' }
  const lib = encodeURIComponent(config.libraryId)

  return {
    libraryId: config.libraryId,

    async createVideo({ title }) {
      const { status, body } = await providerJson<{ guid?: string; Message?: string }>(
        'bunny',
        `${API}/library/${lib}/videos`,
        { method: 'POST', headers, body: JSON.stringify({ title: title.slice(0, 200) }) },
      )
      if (status !== 200 || !body?.guid) {
        // Bunny explains refusals (bad key, wrong library, suspended account) in `Message`.
        throw new ProviderError(
          'bunny',
          status,
          `video not created (${status}${body?.Message ? `: ${body.Message.slice(0, 200)}` : ''})`,
        )
      }
      return { videoId: body.guid }
    },

    authorizeUpload({ videoId, expiresAt }) {
      const exp = Math.floor(expiresAt.getTime() / 1000)
      return {
        endpoint: `${API}/tusupload`,
        headers: {
          AuthorizationSignature: tusSignature(config.libraryId, config.apiKey, exp, videoId),
          AuthorizationExpire: String(exp),
          VideoId: videoId,
          LibraryId: config.libraryId,
        },
        expiresAt,
      }
    },

    async getVideo(videoId): Promise<VideoInfo | null> {
      const { status, body } = await providerJson<{
        status: number
        length?: number
        width?: number
        height?: number
        thumbnailFileName?: string | null
      }>('bunny', `${API}/library/${lib}/videos/${encodeURIComponent(videoId)}`, { headers })
      if (status === 404) return null
      if (status !== 200 || !body) throw new ProviderError('bunny', status, 'video lookup failed')
      const s = mapStatus(body.status)
      return {
        status: s,
        durationSec: body.length ? Math.round(body.length) : null,
        width: body.width || null,
        height: body.height || null,
        thumbnailUrl:
          s === 'ready' && body.thumbnailFileName
            ? `https://${config.cdnHostname}/${videoId}/${body.thumbnailFileName}`
            : null,
      }
    },

    async deleteVideo(videoId) {
      const { status } = await providerJson<unknown>(
        'bunny',
        `${API}/library/${lib}/videos/${encodeURIComponent(videoId)}`,
        { method: 'DELETE', headers },
      )
      if (status !== 200 && status !== 404) {
        throw new ProviderError('bunny', status, 'video not deleted')
      }
    },

    async fetchVideo({ url, title }) {
      const { status, body } = await providerJson<{
        success?: boolean
        id?: string
        guid?: string
      }>('bunny', `${API}/library/${lib}/videos/fetch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url, title: title.slice(0, 200) }),
        timeoutMs: 30_000,
      })
      if (status !== 200 || body?.success === false) {
        throw new ProviderError('bunny', status, 'fetch not accepted')
      }
      return { videoId: body?.id ?? body?.guid ?? null }
    },

    async findVideoByTitle(title) {
      const q = new URLSearchParams({
        search: title.slice(0, 200),
        orderBy: 'date',
        itemsPerPage: '20',
      })
      const { status, body } = await providerJson<{
        items?: Array<{ guid: string; title: string }>
      }>('bunny', `${API}/library/${lib}/videos?${q}`, { headers })
      if (status !== 200) throw new ProviderError('bunny', status, 'video search failed')
      return body?.items?.find((v) => v.title === title.slice(0, 200))?.guid ?? null
    },

    playbackUrls({ videoId, expiresAt }) {
      const exp = Math.floor(expiresAt.getTime() / 1000)
      const token = playbackToken(config.tokenAuthKey, videoId, exp)
      const q = `token=${token}&expires=${exp}`
      return {
        embedUrl: `https://iframe.mediadelivery.net/embed/${lib}/${encodeURIComponent(videoId)}?${q}`,
        hlsUrl: `https://${config.cdnHostname}/${videoId}/playlist.m3u8?${q}`,
      }
    },

    verifyWebhookSignature: (rawBody, signature) =>
      isValidBunnySignature(config.webhookSecret, rawBody, signature),
  }
}
