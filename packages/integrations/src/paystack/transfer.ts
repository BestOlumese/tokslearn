import type { TransferStatus } from './types'

/** Paystack's NGN transfer fee tiers: ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above. */
export function transferFeeKobo(amountKobo: bigint): bigint {
  if (amountKobo <= 500_000n) return 1_000n
  if (amountKobo <= 5_000_000n) return 2_500n
  return 5_000n
}

export function mapTransferStatus(status: string | undefined): TransferStatus {
  switch (status) {
    case 'success':
      return 'success'
    case 'reversed':
      return 'reversed'
    case 'failed':
    case 'abandoned':
    case 'blocked':
    case 'rejected':
      return 'failed'
    default:
      // pending, queued, processing, received, otp
      return 'pending'
  }
}
