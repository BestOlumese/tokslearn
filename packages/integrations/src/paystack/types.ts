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

  verifyTransaction(reference: string): Promise<{
    status: 'success' | 'failed' | 'abandoned' | 'pending'
    amountKobo: bigint
    currency: string
    channel: string | null
    paidAt: Date | null
  }>

  /** HMAC SHA-512 of the raw body with the secret key, compared in constant time. */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean
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
