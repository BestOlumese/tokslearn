import { createCtx, systemActor } from '@tokslearn/core/kernel'
import * as live from '@tokslearn/core/live'
import { getDb } from '@tokslearn/db'
import { requestOutboxDispatch } from '@tokslearn/jobs'
import { getProviders } from '@/lib/auth'
import { requestIdFrom } from '@/lib/request'

// Daily webhook (docs/06 §7, docs/10 §11, docs/09 §6): verify the HMAC signature, then record
// and apply the event in one transaction (meeting start/end, attendance, recording ready). The
// recording import itself runs in a job, so this returns fast.

export async function POST(request: Request) {
  const raw = await request.text()
  let body: { id?: unknown; type?: unknown; payload?: unknown; test?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('bad body', { status: 400 })
  }
  // Daily's check when the webhook is registered: answer 200 without doing anything.
  if (body.test === 'test') return new Response('ok', { status: 200 })

  const providers = getProviders()
  if (
    !providers.live.verifyWebhookSignature(
      raw,
      request.headers.get('x-webhook-timestamp'),
      request.headers.get('x-webhook-signature'),
    )
  ) {
    return new Response('invalid signature', { status: 401 })
  }
  if (
    typeof body.id !== 'string' ||
    typeof body.type !== 'string' ||
    typeof body.payload !== 'object' ||
    body.payload === null
  ) {
    return new Response('ignored', { status: 200 })
  }
  const ctx = createCtx({
    actor: systemActor('daily-webhook'),
    db: getDb(),
    requestId: requestIdFrom(request.headers),
    providers,
    // A finished recording goes to the import job now, not at the next outbox sweep.
    onOutboxWritten: requestOutboxDispatch,
  })
  await live.handleDailyEvent(ctx, {
    id: body.id,
    type: body.type,
    payload: body.payload as Record<string, unknown>,
  })
  return new Response('ok', { status: 200 })
}
