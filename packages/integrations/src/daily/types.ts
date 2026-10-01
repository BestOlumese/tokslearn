/** Live classes boundary (Daily, ADR-008, docs/10 §11). The API key never leaves the server. */
export interface LiveProvider {
  /**
   * Creates the private room, or updates it when one with this name exists (a rescheduled
   * session). Everyone is ejected when the room expires.
   */
  upsertRoom(input: {
    name: string
    expiresAt: Date
    maxParticipants: number
    recording: boolean
  }): Promise<{ roomName: string; url: string }>
  /** A meeting token for one person in one room, valid until `expiresAt`. */
  createMeetingToken(input: {
    roomName: string
    userId: string
    userName: string
    isOwner: boolean
    expiresAt: Date
    /** Hosts of a recorded session start the cloud recording when they join. */
    startRecording: boolean
  }): Promise<string>
  /** A short-lived download link for a finished cloud recording. */
  recordingDownloadUrl(recordingId: string): Promise<string>
  /** Deletes Daily's copy once Bunny has it (storage costs, docs/09 §6). Missing is fine. */
  deleteRecording(recordingId: string): Promise<void>
  /**
   * `X-Webhook-Signature`: base64 HMAC-SHA256 of `{timestamp}.{raw body}`, keyed with the
   * base64-decoded webhook secret.
   */
  verifyWebhookSignature(
    rawBody: string,
    timestamp: string | null,
    signature: string | null,
  ): boolean
}
