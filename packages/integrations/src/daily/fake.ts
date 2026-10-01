import { ProviderError } from '../shared/http'
import { isValidDailySignature } from './signing'
import type { LiveProvider } from './types'

/** Test double: rooms and tokens are recorded so tests can check what was asked for. */
export function createFakeDaily(
  webhookSecret = Buffer.from('daily-test-secret').toString('base64'),
) {
  const rooms = new Map<string, { expiresAt: Date; maxParticipants: number; recording: boolean }>()
  const tokens: Array<{ roomName: string; userId: string; isOwner: boolean; expiresAt: Date }> = []
  const deletedRecordings: string[] = []
  let failing = false
  const provider: LiveProvider = {
    async upsertRoom({ name, expiresAt, maxParticipants, recording }) {
      if (failing) throw new ProviderError('daily', null, 'unreachable')
      rooms.set(name, { expiresAt, maxParticipants, recording })
      return { roomName: name, url: `https://tokslearn.daily.test/${name}` }
    },
    async createMeetingToken({ roomName, userId, isOwner, expiresAt }) {
      if (failing) throw new ProviderError('daily', null, 'unreachable')
      tokens.push({ roomName, userId, isOwner, expiresAt })
      return `fake-token:${roomName}:${userId}:${isOwner ? 'owner' : 'guest'}`
    },
    async recordingDownloadUrl(recordingId) {
      return `https://recordings.daily.test/${recordingId}.mp4`
    },
    async deleteRecording(recordingId) {
      deletedRecordings.push(recordingId)
    },
    verifyWebhookSignature: (rawBody, timestamp, signature) =>
      isValidDailySignature(webhookSecret, rawBody, timestamp, signature),
  }
  return {
    provider,
    rooms,
    tokens,
    deletedRecordings,
    webhookSecret,
    setFailing: (on: boolean) => {
      failing = on
    },
  }
}
