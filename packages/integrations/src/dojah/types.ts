/**
 * KYC boundary (Dojah, docs/04 §4). Returns verification results and provider references only;
 * raw BVN/NIN is passed through and never stored (CLAUDE.md §1.9).
 */
export interface KycProvider {
  verifyIdentity(input: {
    kind: 'bvn' | 'nin'
    number: string
    firstName: string
    lastName: string
    selfieImageBase64?: string
  }): Promise<{
    status: 'verified' | 'mismatch' | 'not_found'
    providerReference: string
    matchedName: string | null
    selfieMatch: boolean | null
  }>
}
