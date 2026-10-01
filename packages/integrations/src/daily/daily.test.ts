import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDaily } from './client'

const secret = Buffer.from('webhook-secret-bytes').toString('base64')
const daily = createDaily({ apiKey: 'daily-key', webhookSecret: secret })

afterEach(() => vi.unstubAllGlobals())

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('daily', () => {
  it('accepts only webhooks signed with the decoded secret over timestamp.body', () => {
    const body = JSON.stringify({ type: 'participant.left', id: 'evt-1' })
    const ts = '1727780000'
    const good = createHmac('sha256', Buffer.from(secret, 'base64'))
      .update(`${ts}.${body}`)
      .digest('base64')
    expect(daily.verifyWebhookSignature(body, ts, good)).toBe(true)
    expect(daily.verifyWebhookSignature(`${body} `, ts, good)).toBe(false)
    expect(daily.verifyWebhookSignature(body, '1727780001', good)).toBe(false)
    expect(daily.verifyWebhookSignature(body, null, good)).toBe(false)
    expect(daily.verifyWebhookSignature(body, ts, null)).toBe(false)
  })

  it('creates a private room, or updates it when the name exists', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) })
        return calls.length === 1
          ? json(400, { error: 'invalid-request-error', info: 'a room named tl-1 already exists' })
          : json(200, { name: 'tl-1', url: 'https://tokslearn.daily.co/tl-1' })
      }),
    )
    const expiresAt = new Date('2026-10-01T12:30:00Z')
    const room = await daily.upsertRoom({
      name: 'tl-1',
      expiresAt,
      maxParticipants: 50,
      recording: true,
    })
    expect(room).toEqual({ roomName: 'tl-1', url: 'https://tokslearn.daily.co/tl-1' })
    expect(calls[0]?.url).toBe('https://api.daily.co/v1/rooms')
    expect(calls[0]?.body).toMatchObject({
      name: 'tl-1',
      privacy: 'private',
      properties: {
        exp: expiresAt.getTime() / 1000,
        eject_at_room_exp: true,
        max_participants: 50,
        enable_recording: 'cloud',
      },
    })
    expect(calls[1]?.url).toBe('https://api.daily.co/v1/rooms/tl-1')
  })

  it('gives learners a muted guest token and hosts an owner token that starts recording', async () => {
    const sent: Array<Record<string, unknown>> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)).properties)
        return json(200, { token: 'tok' })
      }),
    )
    const base = {
      roomName: 'tl-1',
      userName: 'Ada E.',
      expiresAt: new Date('2026-10-01T12:30:00Z'),
      startRecording: true,
    }
    await daily.createMeetingToken({ ...base, userId: 'u1', isOwner: false })
    await daily.createMeetingToken({ ...base, userId: 'u2', isOwner: true })
    expect(sent[0]).toMatchObject({ is_owner: false, start_audio_off: true, user_id: 'u1' })
    expect(sent[0]).not.toHaveProperty('start_cloud_recording')
    expect(sent[1]).toMatchObject({ is_owner: true, start_cloud_recording: true })
  })
})
