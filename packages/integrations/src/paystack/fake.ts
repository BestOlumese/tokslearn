import { isValidPaystackSignature } from './signature'
import type { PaymentProvider } from './types'

type Outcome = 'success' | 'failed' | 'abandoned' | 'pending' | 'amount_mismatch'

/**
 * Test double (docs/15 §1): simulate success, failure, amount mismatch and webhook replay.
 * `setOutcome(reference, …)` decides what `verifyTransaction` returns.
 */
export function createFakePaystack(secretKey = 'sk_test_fake') {
  const initialized = new Map<string, bigint>()
  const outcomes = new Map<string, Outcome>()

  const provider: PaymentProvider = {
    async initializeTransaction(input) {
      initialized.set(input.reference, input.amountKobo)
      return {
        authorizationUrl: `https://checkout.paystack.test/${input.reference}`,
        accessCode: `ac_${input.reference}`,
      }
    },
    async verifyTransaction(reference) {
      const amount = initialized.get(reference) ?? 0n
      const outcome = outcomes.get(reference) ?? 'success'
      const status = outcome === 'amount_mismatch' ? 'success' : outcome
      return {
        status,
        amountKobo: outcome === 'amount_mismatch' ? amount - 100n : amount,
        currency: 'NGN',
        channel: status === 'success' ? 'card' : null,
        paidAt: status === 'success' ? new Date() : null,
      }
    },
    verifyWebhookSignature: (rawBody, signature) =>
      isValidPaystackSignature(secretKey, rawBody, signature),
  }

  return {
    provider,
    setOutcome: (reference: string, outcome: Outcome) => outcomes.set(reference, outcome),
    initialized,
  }
}
