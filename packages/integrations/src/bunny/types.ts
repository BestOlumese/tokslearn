/** Video hosting boundary (Bunny Stream, ADR-009). Implemented in Phase 2. */
export interface VideoProvider {
  createVideo(input: {
    title: string
  }): Promise<{ videoId: string; uploadUrl: string; uploadExpiresAt: Date }>
  getVideo(videoId: string): Promise<{
    status: 'queued' | 'processing' | 'ready' | 'failed'
    durationSec: number | null
  }>
  /** Token-authenticated playback (docs/17 §1.4: embed and HLS). */
  playbackUrls(input: { videoId: string; expiresAt: Date }): { embedUrl: string; hlsUrl: string }
}
