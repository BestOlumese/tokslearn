// Chart of accounts (docs/08 §5). Codes are data; the type decides the normal balance side.

export type AccountType = 'asset' | 'liability' | 'revenue' | 'expense' | 'equity'

/** Platform-wide accounts. */
export const platformAccounts = {
  cashPaystack: 'platform:cash:paystack',
  cashBank: 'platform:cash:bank',
  revenue: 'platform:revenue',
  gatewayFees: 'platform:gateway_fees',
  refundLosses: 'platform:refund_losses',
  vatPayable: 'tax:vat_payable',
} as const

const platformTypes: Readonly<Record<string, AccountType>> = {
  [platformAccounts.cashPaystack]: 'asset',
  [platformAccounts.cashBank]: 'asset',
  [platformAccounts.revenue]: 'revenue',
  [platformAccounts.gatewayFees]: 'expense',
  [platformAccounts.refundLosses]: 'expense',
  [platformAccounts.vatPayable]: 'liability',
}

export type InstructorBucket = 'pending' | 'available' | 'in_transit' | 'receivable'

const instructorTypes: Readonly<Record<InstructorBucket, AccountType>> = {
  pending: 'liability',
  available: 'liability',
  in_transit: 'liability',
  receivable: 'asset',
}

/** `instructor:{userId}:{bucket}`, created on first posting. */
export const instructorAccount = (userId: string, bucket: InstructorBucket): string =>
  `instructor:${userId}:${bucket}`

const INSTRUCTOR_CODE = /^instructor:([0-9a-f-]{36}):(pending|available|in_transit|receivable)$/

/** Type and owner of an account code, or null for a code outside the chart. */
export function describeAccount(
  code: string,
): { type: AccountType; ownerId: string | null } | null {
  const platform = platformTypes[code]
  if (platform) return { type: platform, ownerId: null }
  const m = INSTRUCTOR_CODE.exec(code)
  if (m?.[1] && m[2]) return { type: instructorTypes[m[2] as InstructorBucket], ownerId: m[1] }
  return null
}

/** Debit-normal accounts grow with debits; the rest grow with credits. */
export const isDebitNormal = (type: AccountType): boolean => type === 'asset' || type === 'expense'
