import * as admin from '@tokslearn/core/admin'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { getDb } from '@tokslearn/db'
import { bunnyWebhookStatus } from '@tokslearn/integrations/bunny'
import { requestVideoRefresh } from '@tokslearn/jobs'
import { getProviders } from '@/lib/auth'
import { requestIdFrom } from '@/lib/request'

// Bunny Stream webhook (docs/06 §7, docs/09 §2): verify the HMAC signature, record the event
// once, hand it to the video-status job and return fast. The job re-reads the video from Bunny,
// so a forged or stale body can't change anything even if it got this far.

export async function POST(request: Request) {
  const raw = await request.text()
  const video = getProviders().video
  if (!video.verifyWebhookSignature(raw, request.headers.get('x-bunnystream-signature'))) {
    return new Response('invalid signature', { status: 401 })
  }
  let body: { VideoLibraryId?: unknown; VideoGuid?: unknown; Status?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('bad body', { status: 400 })
  }
  const videoGuid = typeof body.VideoGuid === 'string' ? body.VideoGuid : null
  const status = typeof body.Status === 'number' ? body.Status : null
  if (!videoGuid || status === null || String(body.VideoLibraryId) !== video.libraryId) {
    return new Response('ignored', { status: 200 })
  }
  // Only finished and failed change our state; progress events are acknowledged.
  if (status !== bunnyWebhookStatus.finished && status !== bunnyWebhookStatus.failed) {
    return new Response('ok', { status: 200 })
  }

  const eventId = `${videoGuid}:${status}`
  const ctx = createCtx({
    actor: systemActor('bunny-webhook'),
    db: getDb(),
    requestId: requestIdFrom(request.headers),
  })
  const seen = await admin.recordWebhookEvent(ctx, {
    provider: 'bunny',
    eventId,
    type: `video.status_${status}`,
    payload: { videoGuid, status },
  })
  if (seen === 'new') await requestVideoRefresh({ videoGuid, eventId })
  return new Response('ok', { status: 200 })
}
