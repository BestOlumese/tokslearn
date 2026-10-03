/** Payment provider boundary (docs/04 §5). Phase 16 adds Stripe/Flutterwave behind it. */
export interface PaymentProvider {
  initializeTransaction(input: {
    reference: string
    email: string
    amountKobo: bigint
    currency: 'NGN'
    callbackUrl: string
    metadata: Readonly<Record<string, string>>
  }): Promise<{ authorizationUrl: string; accessCode: string }>

  /**
   * The transaction as the provider sees it now. `pending` covers everything still in flight
   * (ongoing, processing, queued); `failed` includes reversed.
   */
  verifyTransaction(reference: string): Promise<VerifiedTransaction>

  /** HMAC SHA-512 of the raw body with the secret key, compared in constant time. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean

  /**
   * Refunds part or all of a transaction (docs/08 §7). Paystack queues it; the refund.* webhook
   * says when it's done, and `fetchRefund` confirms.
   */
  createRefund(input: {
    reference: string
    amountKobo: bigint
    merchantNote: string
  }): Promise<{ refundId: string; status: RefundStatus }>
  /** The refund as Paystack sees it now, or null when it doesn't know the id. */
  fetchRefund(refundId: string): Promise<{ status: RefundStatus; amountKobo: bigint } | null>
}

/** `pending` covers pending and processing; `failed` includes needs-attention. */
export type RefundStatus = 'pending' | 'processed' | 'failed'

export interface VerifiedTransaction {
  status: 'success' | 'failed' | 'abandoned' | 'pending'
  /** The reference the provider echoes back; must equal the one asked about. */
  reference: string
  amountKobo: bigint
  currency: string
  channel: string | null
  paidAt: Date | null
  /** What the provider charged for this transaction, in kobo (docs/08 §4). */
  feesKobo: bigint | null
  gatewayResponse: string | null
}

export interface Bank {
  code: string
  name: string
}

/** Bank directory and transfer recipients for instructor payouts (docs/07 §5, docs/08). */
export interface PayoutProvider {
  listBanks(): Promise<ReadonlyArray<Bank>>
  /** The account holder's name, or null when the number doesn't exist at that bank. */
  resolveAccount(input: { accountNumber: string; bankCode: string }): Promise<{
    accountName: string
  } | null>
  createTransferRecipient(input: {
    name: string
    accountNumber: string
    bankCode: string
  }): Promise<{ recipientCode: string }>
}
