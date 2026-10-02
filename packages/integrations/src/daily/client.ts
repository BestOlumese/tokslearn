import 'server-only'
import { ProviderError, providerJson } from '../shared/http'
import { isValidDailySignature } from './signing'
import type { LiveProvider } from './types'

const API = 'https://api.daily.co/v1'

export interface DailyConfig {
  apiKey: string
  /** Base64 secret the webhook was registered with (`pnpm daily:webhook`). */
  webhookSecret: string
}

const seconds = (d: Date) => Math.floor(d.getTime() / 1000)

export function createDaily(config: DailyConfig): LiveProvider {
  const headers = {
    authorization: `Bearer ${config.apiKey}`,
    'content-type': 'application/json',
  }

  /** Creates the room, or updates it when the name exists. */
  async function saveRoom(
    name: string,
    opts: { expiresAt: Date; maxParticipants: number; recording: boolean },
  ): Promise<{ roomName: string; url: string } | 'recording_not_in_plan'> {
    const properties = {
      exp: seconds(opts.expiresAt),
      eject_at_room_exp: true,
      max_participants: opts.maxParticipants,
      enable_prejoin_ui: true,
      enable_knocking: false,
      enable_chat: true,
      enable_screenshare: true,
      ...(opts.recording ? { enable_recording: 'cloud' } : {}),
    }
    const refused = (r: { status: number; body: { info?: string } | null }) =>
      opts.recording && r.status === 400 && (r.body?.info ?? '').includes('enable_recording')
    const created = await providerJson<{ name?: string; url?: string; info?: string }>(
      'daily',
      `${API}/rooms`,
      { method: 'POST', headers, body: JSON.stringify({ name, privacy: 'private', properties }) },
    )
    if (created.status === 200 && created.body?.url) {
      return { roomName: created.body.name ?? name, url: created.body.url }
    }
    if (refused(created)) return 'recording_not_in_plan'
    if (created.status !== 400 || !created.body?.info?.includes('already exists')) {
      throw new ProviderError('daily', created.status, 'room not created')
    }
    const updated = await providerJson<{ name?: string; url?: string; info?: string }>(
      'daily',
      `${API}/rooms/${encodeURIComponent(name)}`,
      { method: 'POST', headers, body: JSON.stringify({ privacy: 'private', properties }) },
    )
    if (updated.status === 200 && updated.body?.url) {
      return { roomName: updated.body.name ?? name, url: updated.body.url }
    }
    if (refused(updated)) return 'recording_not_in_plan'
    throw new ProviderError('daily', updated.status, 'room not updated')
  }

  return {
    async upsertRoom({ name, expiresAt, maxParticipants, recording }) {
      // Daily refuses cloud recording on plans without it; the class then runs unrecorded.
      const first = await saveRoom(name, { expiresAt, maxParticipants, recording })
      if (first !== 'recording_not_in_plan') return { ...first, recording }
      const second = await saveRoom(name, { expiresAt, maxParticipants, recording: false })
      if (second === 'recording_not_in_plan') {
        throw new ProviderError('daily', 400, 'room not created')
      }
      return { ...second, recording: false }
    },

    async createMeetingToken({ roomName, userId, userName, isOwner, expiresAt, startRecording }) {
      const { status, body } = await providerJson<{ token?: string }>(
        'daily',
        `${API}/meeting-tokens`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            properties: {
              room_name: roomName,
              user_id: userId,
              user_name: userName.slice(0, 100),
              is_owner: isOwner,
              exp: seconds(expiresAt),
              eject_at_token_exp: true,
              // Learners join muted with the camera off: less data on mobile networks.
              start_video_off: !isOwner,
              start_audio_off: !isOwner,
              ...(isOwner && startRecording ? { start_cloud_recording: true } : {}),
            },
          }),
        },
      )
      if (status !== 200 || !body?.token) throw new ProviderError('daily', status, 'no token')
      return body.token
    },

    async recordingDownloadUrl(recordingId) {
      const { status, body } = await providerJson<{ download_link?: string }>(
        'daily',
        `${API}/recordings/${encodeURIComponent(recordingId)}/access-link?valid_for_secs=21600`,
        { headers },
      )
      if (status !== 200 || !body?.download_link) {
        throw new ProviderError('daily', status, 'no recording link')
      }
      return body.download_link
    },

    async deleteRecording(recordingId) {
      const { status } = await providerJson<unknown>(
        'daily',
        `${API}/recordings/${encodeURIComponent(recordingId)}`,
        { method: 'DELETE', headers },
      )
      if (status !== 200 && status !== 404) {
        throw new ProviderError('daily', status, 'recording not deleted')
      }
    },

    verifyWebhookSignature: (rawBody, timestamp, signature) =>
      isValidDailySignature(config.webhookSecret, rawBody, timestamp, signature),
  }
}

/** Events the webhook receives (docs/10 §11, docs/09 §6). */
export const dailyWebhookEvents = [
  'meeting.started',
  'meeting.ended',
  'participant.left',
  'recording.ready-to-download',
  'recording.error',
] as const

/**
 * Registers (or re-points) the domain's webhook. Daily sends a signed test request first and
 * only saves the webhook if the endpoint answers 200 within 8 seconds. Used by `pnpm daily:webhook`.
 */
export async function registerDailyWebhook(input: {
  apiKey: string
  url: string
  hmac: string
}): Promise<{ uuid: string; state: string }> {
  const headers = {
    authorization: `Bearer ${input.apiKey}`,
    'content-type': 'application/json',
  }
  const list = await providerJson<
    Array<{ uuid: string }> | { data?: Array<{ uuid: string }>; info?: string }
  >('daily', `${API}/webhooks`, { headers })
  if (list.status !== 200) {
    const info = list.body && !Array.isArray(list.body) ? list.body.info : undefined
    throw new ProviderError('daily', list.status, info ?? 'webhooks not listed')
  }
  const existing = (Array.isArray(list.body) ? list.body : (list.body?.data ?? []))[0]
  const body = JSON.stringify({
    url: input.url,
    hmac: input.hmac,
    eventTypes: dailyWebhookEvents,
    retryType: 'exponential',
  })
  const res = await providerJson<{ uuid?: string; state?: string; info?: string }>(
    'daily',
    existing ? `${API}/webhooks/${encodeURIComponent(existing.uuid)}` : `${API}/webhooks`,
    { method: 'POST', headers, body, timeoutMs: 30_000 },
  )
  if (res.status !== 200 || !res.body?.uuid) {
    throw new ProviderError('daily', res.status, res.body?.info ?? 'webhook not saved')
  }
  return { uuid: res.body.uuid, state: res.body.state ?? 'unknown' }
}
