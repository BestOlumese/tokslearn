import 'server-only'
import { ProviderError, providerJson } from '../shared/http'
import { isValidPaystackSignature } from './signature'
import type { PaymentProvider, VerifiedTransaction } from './types'

const API = 'https://api.paystack.co'

interface Envelope<T> {
  status: boolean
  message?: string
  data?: T
}

interface PaystackTransaction {
  status: string
  reference: string
  amount: number
  currency: string
  channel?: string | null
  paid_at?: string | null
  paidAt?: string | null
  fees?: number | null
  gateway_response?: string | null
}

const statusOf = (s: string): VerifiedTransaction['status'] => {
  if (s === 'success') return 'success'
  if (s === 'failed' || s === 'reversed') return 'failed'
  if (s === 'abandoned') return 'abandoned'
  return 'pending'
}

/** Paystack transactions (docs/08 §6): initialize for the popup, verify by reference. */
export function createPaystackPayments(config: { secretKey: string }): PaymentProvider {
  const headers = {
    authorization: `Bearer ${config.secretKey}`,
    'content-type': 'application/json',
  }

  return {
    async initializeTransaction(input) {
      const { status, body } = await providerJson<
        Envelope<{ authorization_url: string; access_code: string }>
      >('paystack', `${API}/transaction/initialize`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: input.email,
          amount: input.amountKobo.toString(),
          currency: input.currency,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata,
        }),
      })
      if (status !== 200 || !body?.data?.access_code) {
        throw new ProviderError('paystack', status, 'transaction not initialized')
      }
      return {
        authorizationUrl: body.data.authorization_url,
        accessCode: body.data.access_code,
      }
    },

    async verifyTransaction(reference) {
      const { status, body } = await providerJson<Envelope<PaystackTransaction>>(
        'paystack',
        `${API}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers },
      )
      // An unknown reference is "not paid", not an outage.
      if (status === 400 || status === 404) {
        return {
          status: 'pending',
          reference,
          amountKobo: 0n,
          currency: 'NGN',
          channel: null,
          paidAt: null,
          feesKobo: null,
          gatewayResponse: body?.message ?? null,
        }
      }
      const t = body?.data
      if (status !== 200 || !t) throw new ProviderError('paystack', status, 'verify failed')
      const paidAt = t.paid_at ?? t.paidAt ?? null
      return {
        status: statusOf(t.status),
        reference: t.reference,
        amountKobo: BigInt(t.amount),
        currency: t.currency,
        channel: t.channel ?? null,
        paidAt: paidAt ? new Date(paidAt) : null,
        feesKobo: typeof t.fees === 'number' ? BigInt(t.fees) : null,
        gatewayResponse: t.gateway_response ?? null,
      }
    },

    verifyWebhookSignature: (rawBody, signature) =>
      isValidPaystackSignature(config.secretKey, rawBody, signature),
  }
}
