/**
 * KYC boundary (Dojah, docs/07 §5). Returns results and provider references only. The BVN/NIN is
 * passed through to the provider and never stored or logged (CLAUDE.md §1.9).
 */
export interface KycResult {
  /** `not_found`: the number doesn't exist. `verified`/`selfie_mismatch` both found a record. */
  outcome: 'verified' | 'selfie_mismatch' | 'not_found'
  providerReference: string
  /** Names as registered with the BVN/NIN record, uppercase as the provider returns them. */
  firstName: string | null
  middleName: string | null
  lastName: string | null
  /** Selfie match confidence 0–100, or null when no record was found. */
  faceMatchScore: number | null
  /** Provider response with the ID number, phone, date of birth, photo and address removed. */
  redacted: Record<string, unknown>
}

export interface KycProvider {
  verifyWithSelfie(input: {
    method: 'bvn' | 'nin'
    number: string
    /** Base64 JPEG/PNG without the data-URL prefix. */
    selfieImageBase64: string
  }): Promise<KycResult>
}
