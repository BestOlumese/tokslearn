import 'server-only'
import { ProviderError, providerJson } from '../shared/http'
import { mapTransferStatus } from './transfer'
import type { Bank, PayoutProvider, TransferInfo } from './types'

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

    async bulkTransfer(transfers) {
      if (transfers.length === 0) return []
      if (transfers.length > 100) throw new Error('Paystack takes at most 100 transfers per batch')
      const { status, body } = await providerJson<
        Envelope<ReadonlyArray<{ reference: string; transfer_code: string; status?: string }>>
      >('paystack', `${API}/transfer/bulk`, {
        method: 'POST',
        headers,
        timeoutMs: 30_000,
        body: JSON.stringify({
          currency: 'NGN',
          source: 'balance',
          transfers: transfers.map((t) => ({
            amount: Number(t.amountKobo),
            recipient: t.recipientCode,
            reference: t.reference,
            reason: t.reason.slice(0, 100),
          })),
        }),
      })
      if (status !== 200 || !body?.data) {
        // e.g. "Your balance is not enough to fulfil this request"
        throw new ProviderError('paystack', status, `bulk transfer refused: ${body?.message ?? ''}`)
      }
      return body.data.map((t) => ({
        reference: t.reference,
        transferCode: t.transfer_code,
        status: mapTransferStatus(t.status),
      }))
    },

    async fetchTransfer(reference): Promise<TransferInfo | null> {
      const { status, body } = await providerJson<
        Envelope<{
          status?: string
          transfer_code?: string
          amount?: number
          fee_charged?: number
          reason?: string
          failures?: unknown
          gateway_response?: string
        }>
      >('paystack', `${API}/transfer/verify/${encodeURIComponent(reference)}`, { headers })
      if (status === 404 || status === 400) return null
      if (status !== 200 || !body?.data) {
        throw new ProviderError('paystack', status, 'transfer lookup failed')
      }
      const d = body.data
      const mapped = mapTransferStatus(d.status)
      return {
        status: mapped,
        transferCode: d.transfer_code ?? null,
        amountKobo: BigInt(Math.round(d.amount ?? 0)),
        feeKobo: typeof d.fee_charged === 'number' ? BigInt(Math.round(d.fee_charged)) : null,
        failureReason:
          mapped === 'failed' || mapped === 'reversed'
            ? (d.gateway_response ?? (typeof d.failures === 'string' ? d.failures : null))
            : null,
      }
    },
  }
}
