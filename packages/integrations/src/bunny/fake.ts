import type { VideoProvider } from './types'

export function createFakeBunny(): VideoProvider & {
  markReady(videoId: string, durationSec: number): void
} {
  const videos = new Map<
    string,
    { status: 'queued' | 'processing' | 'ready' | 'failed'; durationSec: number | null }
  >()
  let n = 0
  return {
    async createVideo() {
      n++
      const videoId = `fake-video-${n}`
      videos.set(videoId, { status: 'queued', durationSec: null })
      return {
        videoId,
        uploadUrl: `https://video.bunny.test/upload/${videoId}`,
        uploadExpiresAt: new Date(Date.now() + 3_600_000),
      }
    },
    async getVideo(videoId) {
      return videos.get(videoId) ?? { status: 'failed', durationSec: null }
    },
    playbackUrls({ videoId, expiresAt }) {
      const exp = Math.floor(expiresAt.getTime() / 1000)
      return {
        embedUrl: `https://iframe.bunny.test/embed/${videoId}?expires=${exp}`,
        hlsUrl: `https://vz.bunny.test/${videoId}/playlist.m3u8?expires=${exp}`,
      }
    },
    markReady(videoId, durationSec) {
      videos.set(videoId, { status: 'ready', durationSec })
    },
  }
}
