import { isValidBunnySignature, playbackToken } from './signing'
import type { VideoInfo, VideoProvider } from './types'

/** Test double: videos start processing; `setVideo` moves them to ready or failed. */
export function createFakeBunny(webhookSecret = 'bunny-test-secret') {
  const videos = new Map<string, VideoInfo>()
  const titles = new Map<string, string>()
  const fetched: Array<{ url: string; title: string }> = []
  const deleted: string[] = []
  let n = 0
  const newVideo = (title: string) => {
    n++
    const videoId = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
    videos.set(videoId, {
      status: 'processing',
      durationSec: null,
      width: null,
      height: null,
      thumbnailUrl: null,
    })
    titles.set(videoId, title)
    return videoId
  }
  const provider: VideoProvider = {
    libraryId: 'test-library',
    async createVideo({ title }) {
      return { videoId: newVideo(title) }
    },
    // Like the documented API: the response doesn't say which video was created.
    async fetchVideo({ url, title }) {
      fetched.push({ url, title })
      newVideo(title)
      return { videoId: null }
    },
    async findVideoByTitle(title) {
      const hits = [...titles].filter(([id, t]) => t === title && videos.has(id))
      return hits[hits.length - 1]?.[0] ?? null
    },
    authorizeUpload({ videoId, expiresAt }) {
      const exp = Math.floor(expiresAt.getTime() / 1000)
      return {
        endpoint: 'https://video.bunny.test/tusupload',
        headers: {
          AuthorizationSignature: `sig-${videoId}-${exp}`,
          AuthorizationExpire: String(exp),
          VideoId: videoId,
          LibraryId: 'test-library',
        },
        expiresAt,
      }
    },
    async getVideo(videoId) {
      return videos.get(videoId) ?? null
    },
    async deleteVideo(videoId) {
      videos.delete(videoId)
      deleted.push(videoId)
    },
    playbackUrls({ videoId, expiresAt }) {
      const exp = Math.floor(expiresAt.getTime() / 1000)
      const token = playbackToken('test-token-key', videoId, exp)
      return {
        embedUrl: `https://iframe.bunny.test/embed/test-library/${videoId}?token=${token}&expires=${exp}`,
        hlsUrl: `https://vz.bunny.test/${videoId}/playlist.m3u8?token=${token}&expires=${exp}`,
      }
    },
    verifyWebhookSignature: (rawBody, signature) =>
      isValidBunnySignature(webhookSecret, rawBody, signature),
  }
  return {
    provider,
    deleted,
    fetched,
    setVideo: (videoId: string, info: Partial<VideoInfo>) => {
      const current = videos.get(videoId)
      if (current) videos.set(videoId, { ...current, ...info })
    },
  }
}
