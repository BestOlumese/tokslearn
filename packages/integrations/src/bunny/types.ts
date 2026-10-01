/** Video hosting boundary (Bunny Stream, docs/09, ADR-009). The API key never leaves the server. */
export type VideoStatus = 'processing' | 'ready' | 'failed'

export interface VideoInfo {
  status: VideoStatus
  durationSec: number | null
  width: number | null
  height: number | null
  thumbnailUrl: string | null
}

/** Headers the browser sends with tus-js-client; the signature expires at `expiresAt`. */
export interface UploadAuthorization {
  endpoint: string
  headers: {
    AuthorizationSignature: string
    AuthorizationExpire: string
    VideoId: string
    LibraryId: string
  }
  expiresAt: Date
}

export interface VideoProvider {
  readonly libraryId: string
  createVideo(input: { title: string }): Promise<{ videoId: string }>
  authorizeUpload(input: { videoId: string; expiresAt: Date }): UploadAuthorization
  getVideo(videoId: string): Promise<VideoInfo | null>
  deleteVideo(videoId: string): Promise<void>
  /**
   * Asks Bunny to download a video from a URL (live recordings, docs/09 §6). Returns the new
   * video's id when Bunny says it; otherwise find it with `findVideoByTitle`.
   */
  fetchVideo(input: { url: string; title: string }): Promise<{ videoId: string | null }>
  /** The newest video with exactly this title, if any. */
  findVideoByTitle(title: string): Promise<string | null>
  /** Token-authenticated embed and HLS URLs (docs/09 §3). */
  playbackUrls(input: { videoId: string; expiresAt: Date }): { embedUrl: string; hlsUrl: string }
  /** `X-BunnyStream-Signature`: hex HMAC-SHA256 of the raw body with the read-only API key. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean
}

/** Bunny webhook `Status` codes that change our state (others are progress noise). */
export const bunnyWebhookStatus = {
  finished: 3,
  failed: 5,
} as const
