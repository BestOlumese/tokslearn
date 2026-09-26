import 'server-only'
import { ProviderError, providerJson } from '../shared/http'
import type { Bank, PayoutProvider } from './types'

const API = 'https://api.paystack.co'

interface Envelope<T> {
  status: boolean
  message?: string
  data?: T
}

/**
 * Paystack bank directory, account resolution and transfer recipients (docs/07 §5 step 4).
 * The full account number goes to Paystack and nowhere else.
 */
export function createPaystackPayouts(config: { secretKey: string }): PayoutProvider {
  const headers = {
    authorization: `Bearer ${config.secretKey}`,
    'content-type': 'application/json',
  }

  return {
    async listBanks() {
      const { status, body } = await providerJson<
        Envelope<
          ReadonlyArray<{ name: string; code: string; active: boolean; is_deleted?: boolean }>
        >
      >('paystack', `${API}/bank?country=nigeria&currency=NGN&perPage=200`, { headers })
      if (status !== 200 || !body?.data) {
        throw new ProviderError('paystack', status, 'bank list unavailable')
      }
      const seen = new Set<string>()
      const banks: Bank[] = []
      for (const b of body.data) {
        if (!b.active || b.is_deleted || seen.has(b.code)) continue
        seen.add(b.code)
        banks.push({ code: b.code, name: b.name })
      }
      return banks.sort((a, b) => a.name.localeCompare(b.name))
    },

    async resolveAccount({ accountNumber, bankCode }) {
      const q = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode })
      const { status, body } = await providerJson<Envelope<{ account_name: string }>>(
        'paystack',
        `${API}/bank/resolve?${q}`,
        { headers },
      )
      // Paystack answers 422/400 when the number doesn't exist at that bank.
      if (status === 400 || status === 404 || status === 422) return null
      if (status !== 200 || !body?.data?.account_name) {
        throw new ProviderError('paystack', status, 'account resolution failed')
      }
      return { accountName: body.data.account_name }
    },

    async createTransferRecipient({ name, accountNumber, bankCode }) {
      const { status, body } = await providerJson<Envelope<{ recipient_code: string }>>(
        'paystack',
        `${API}/transferrecipient`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: 'nuban',
            name,
            account_number: accountNumber,
            bank_code: bankCode,
            currency: 'NGN',
          }),
        },
      )
      if ((status !== 200 && status !== 201) || !body?.data?.recipient_code) {
        throw new ProviderError('paystack', status, 'transfer recipient not created')
      }
      return { recipientCode: body.data.recipient_code }
    },
  }
}
