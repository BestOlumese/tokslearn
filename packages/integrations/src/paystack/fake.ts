import { isValidPaystackSignature } from './signature'
import type { PaymentProvider, PayoutProvider } from './types'

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
