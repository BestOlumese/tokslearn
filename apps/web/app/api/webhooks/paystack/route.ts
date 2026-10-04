import * as commerce from '@tokslearn/core/commerce'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { getDb } from '@tokslearn/db'
import { requestPayoutSettle, requestPaystackCharge, requestRefundSettle } from '@tokslearn/jobs'
import { getProviders } from '@/lib/auth'
import { requestIdFrom } from '@/lib/request'

// Paystack webhook (docs/06 §7, docs/08 §6). Verify the HMAC SHA-512 signature on the raw body,
// record the event once, hand charge.success to the paystack-charge job and answer 200 fast.
// The job asks Paystack for the transaction itself, so the body is never trusted for amounts.
// refund.* events hand the transaction to the refund-settle job, which fetches each refund from
// Paystack (ADR-043). transfer.* events name our payout reference: the payout-settle job asks
// Paystack about it (ADR-046).

export async function POST(request: Request) {
  const raw = await request.text()
  const payments = getProviders().payments
  if (!payments.verifyWebhookSignature(raw, request.headers.get('x-paystack-signature'))) {
    return new Response('invalid signature', { status: 401 })
  }
  let body: {
    event?: unknown
    data?: { id?: unknown; reference?: unknown; transaction_reference?: unknown; amount?: unknown }
  }
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('bad body', { status: 400 })
  }
  const event = typeof body.event === 'string' ? body.event : null
  // Refund events name the transaction, not themselves.
  if (event?.startsWith('refund.')) {
    const ref = body.data?.transaction_reference
    if (typeof ref !== 'string') return new Response('ignored', { status: 200 })
    const ctx = createCtx({
      actor: systemActor('paystack-webhook'),
      db: getDb(),
      requestId: requestIdFrom(request.headers),
    })
    const eventId = `${event}:${ref}:${String(body.data?.amount ?? '')}`
    const seen = await commerce.recordPaymentEvent(ctx, {
      eventId,
      type: event,
      payload: { event, reference: ref },
    })
    if (seen === 'new') await requestRefundSettle({ reference: ref, eventId })
    return new Response('ok', { status: 200 })
  }
  // Transfer events carry our payout reference; the job checks the transfer with Paystack.
  if (event?.startsWith('transfer.')) {
    const ref = body.data?.reference
    if (typeof ref !== 'string') return new Response('ignored', { status: 200 })
    const ctx = createCtx({
      actor: systemActor('paystack-webhook'),
      db: getDb(),
      requestId: requestIdFrom(request.headers),
    })
    const eventId = `${event}:${ref}`
    const seen = await commerce.recordPaymentEvent(ctx, {
      eventId,
      type: event,
      payload: { event, reference: ref },
    })
    if (seen === 'new') await requestPayoutSettle({ reference: ref, eventId })
    return new Response('ok', { status: 200 })
  }
  const reference = typeof body.data?.reference === 'string' ? body.data.reference : null
  const transactionId =
    typeof body.data?.id === 'number' || typeof body.data?.id === 'string' ? body.data.id : null
  if (!event || !reference || transactionId === null) {
    return new Response('ignored', { status: 200 })
  }

  const eventId = commerce.paystackEventId(event, transactionId, reference)
  const ctx = createCtx({
    actor: systemActor('paystack-webhook'),
    db: getDb(),
    requestId: requestIdFrom(request.headers),
  })
  // Keep what we need to debug, not the customer's card or bank details.
  const seen = await commerce.recordPaymentEvent(ctx, {
    eventId,
    type: event,
    payload: { event, reference, transactionId: String(transactionId) },
  })
  if (seen === 'new' && event === 'charge.success') {
    await requestPaystackCharge({ reference, eventId })
  } else if (seen === 'new') {
    await commerce.markPaymentEventProcessed(ctx, { eventId, error: 'not_handled_yet' })
  }
  return new Response('ok', { status: 200 })
}
