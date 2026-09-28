import { ProviderError } from '../shared/http'
import { isValidPaystackSignature } from './signature'
import type { PaymentProvider, PayoutProvider } from './types'

type Outcome = 'success' | 'failed' | 'abandoned' | 'pending' | 'amount_mismatch' | 'unreachable'

/** Paystack's local card pricing: 1.5% + ₦100 (waived under ₦2,500), capped at ₦2,000. */
export function paystackFee(amountKobo: bigint): bigint {
  const pct = (amountKobo * 150n + 5_000n) / 10_000n
  const fee = pct + (amountKobo >= 250_000n ? 10_000n : 0n)
  return fee > 200_000n ? 200_000n : fee
}

/**
 * Test double (docs/15 §1): simulate success, failure, amount mismatch and webhook replay.
 * `setOutcome(reference, …)` decides what `verifyTransaction` returns.
 */
export function createFakePaystack(secretKey = 'sk_test_fake') {
  const initialized = new Map<string, bigint>()
  const outcomes = new Map<string, Outcome>()
  const fees = new Map<string, bigint>()
  const channels = new Map<string, string>()
  let verifyCalls = 0
  let initializeDown = false

  const provider: PaymentProvider = {
    async initializeTransaction(input) {
      if (initializeDown) throw new ProviderError('paystack', 503, 'responded 503')
      initialized.set(input.reference, input.amountKobo)
      return {
        authorizationUrl: `https://checkout.paystack.test/${input.reference}`,
        accessCode: `ac_${input.reference}`,
      }
    },
    async verifyTransaction(reference) {
      verifyCalls++
      if (outcomes.get(reference) === 'unreachable')
        throw new ProviderError('paystack', null, 'unreachable')
      const amount = initialized.get(reference) ?? 0n
      const outcome = outcomes.get(reference) ?? 'success'
      const status =
        outcome === 'amount_mismatch' || outcome === 'unreachable' ? 'success' : outcome
      return {
        status,
        reference,
        amountKobo: outcome === 'amount_mismatch' ? amount - 100n : amount,
        currency: 'NGN',
        channel: status === 'success' ? (channels.get(reference) ?? 'card') : null,
        paidAt: status === 'success' ? new Date() : null,
        // Paystack local cards: 1.5% + ₦100 above ₦2,500, capped at ₦2,000.
        feesKobo: status === 'success' ? (fees.get(reference) ?? paystackFee(amount)) : null,
        gatewayResponse: status === 'success' ? 'Approved' : 'Declined',
      }
    },
    verifyWebhookSignature: (rawBody, signature) =>
      isValidPaystackSignature(secretKey, rawBody, signature),
  }

  return {
    provider,
    setOutcome: (reference: string, outcome: Outcome) => outcomes.set(reference, outcome),
    setFee: (reference: string, kobo: bigint) => fees.set(reference, kobo),
    setChannel: (reference: string, channel: string) => channels.set(reference, channel),
    verifyCalls: () => verifyCalls,
    /** Simulates Paystack being down when a payment is started. */
    setInitializeDown: (down: boolean) => {
      initializeDown = down
    },
    initialized,
  }
}

/**
 * Payout test double. Account numbers ending in 0 don't resolve; the account name is the one
 * registered with `setAccountName`, else "ADA LOVELACE".
 */
export function createFakePayouts() {
  const names = new Map<string, string>()
  const recipients: Array<{ name: string; bankCode: string; last4: string }> = []
  const provider: PayoutProvider = {
    async listBanks() {
      return [
        { code: '044', name: 'Access Bank' },
        { code: '058', name: 'Guaranty Trust Bank' },
        { code: '50211', name: 'Kuda Bank' },
        { code: '999992', name: 'OPay' },
        { code: '033', name: 'United Bank For Africa' },
        { code: '057', name: 'Zenith Bank' },
      ]
    },
    async resolveAccount({ accountNumber }) {
      if (accountNumber.endsWith('0')) return null
      return { accountName: names.get(accountNumber) ?? 'ADA LOVELACE' }
    },
    async createTransferRecipient({ name, accountNumber, bankCode }) {
      recipients.push({ name, bankCode, last4: accountNumber.slice(-4) })
      return { recipientCode: `RCP_fake${recipients.length}` }
    },
  }
  return {
    provider,
    recipients,
    setAccountName: (accountNumber: string, name: string) => names.set(accountNumber, name),
  }
}
