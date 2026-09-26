import type { KycProvider } from './types'

/** Numbers ending in 0 are not found, ending in 1 mismatch; everything else verifies. */
export function createFakeKyc(): KycProvider {
  let n = 0
  return {
    async verifyIdentity({ number, firstName, lastName, selfieImageBase64 }) {
      n++
      const last = number.at(-1)
      const status = last === '0' ? 'not_found' : last === '1' ? 'mismatch' : 'verified'
      return {
        status,
        providerReference: `fake-kyc-${n}`,
        matchedName: status === 'verified' ? `${firstName} ${lastName}` : null,
        selfieMatch: selfieImageBase64 ? status === 'verified' : null,
      }
    },
  }
}
