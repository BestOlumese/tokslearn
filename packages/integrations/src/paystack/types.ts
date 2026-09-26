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
