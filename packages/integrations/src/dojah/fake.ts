import type { KycProvider } from './types'

/**
 * Test double. Numbers ending in 0 aren't found, ending in 1 fail the selfie match; everything
 * else verifies. The registered name is set with `setName` (default ADA NNEKA LOVELACE).
 */
export function createFakeKyc() {
  let n = 0
  let name = { first: 'ADA', middle: 'NNEKA', last: 'LOVELACE' }
  const calls: Array<{ method: 'bvn' | 'nin'; last4: string }> = []
  const provider: KycProvider = {
    async verifyWithSelfie({ method, number }) {
      n++
      calls.push({ method, last4: number.slice(-4) })
      const last = number.at(-1)
      if (last === '0') {
        return {
          outcome: 'not_found',
          providerReference: `fake-kyc-${n}`,
          firstName: null,
          middleName: null,
          lastName: null,
          faceMatchScore: null,
          redacted: {},
        }
      }
      const score = last === '1' ? 41.5 : 97.2
      return {
        outcome: last === '1' ? 'selfie_mismatch' : 'verified',
        providerReference: `fake-kyc-${n}`,
        firstName: name.first,
        middleName: name.middle,
        lastName: name.last,
        faceMatchScore: score,
        redacted: {
          first_name: name.first,
          last_name: name.last,
          selfie_verification: { confidence_value: score, match: last !== '1' },
        },
      }
    },
  }
  return {
    provider,
    calls,
    setName: (first: string, middle: string | null, last: string) => {
      name = { first, middle: middle ?? '', last }
    },
  }
}
