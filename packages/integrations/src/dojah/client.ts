import 'server-only'
import { randomUUID } from 'node:crypto'
import { ProviderError, providerJson } from '../shared/http'
import type { KycProvider, KycResult } from './types'

/** Fields we keep from the provider response. Everything else (ID numbers, phone, DOB, photo,
 * address, email) is dropped before it leaves this function. */
const KEEP = new Set([
  'first_name',
  'firstname',
  'middle_name',
  'middlename',
  'last_name',
  'surname',
  'gender',
])

function redact(entity: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(entity)) {
    if (KEEP.has(k) && (typeof v === 'string' || v === null)) out[k] = v
  }
  const selfie = entity.selfie_verification
  if (selfie && typeof selfie === 'object') {
    const s = selfie as { confidence_value?: unknown; match?: unknown }
    out.selfie_verification = {
      confidence_value: typeof s.confidence_value === 'number' ? s.confidence_value : null,
      match: typeof s.match === 'boolean' ? s.match : null,
    }
  }
  return out
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Dojah BVN/NIN lookup with selfie match: `POST /api/v1/kyc/{bvn|nin}/verify`.
 * `baseUrl` is https://sandbox.dojah.io in development and https://api.dojah.io in production.
 */
export function createDojahKyc(config: {
  appId: string
  secretKey: string
  baseUrl: string
}): KycProvider {
  return {
    async verifyWithSelfie({ method, number, selfieImageBase64 }): Promise<KycResult> {
      const { status, body } = await providerJson<{ entity?: Record<string, unknown> }>(
        'dojah',
        `${config.baseUrl.replace(/\/$/, '')}/api/v1/kyc/${method}/verify`,
        {
          method: 'POST',
          headers: {
            // Dojah wants the secret key as-is, not "Bearer …".
            authorization: config.secretKey,
            appid: config.appId,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ [method]: number, selfie_image: selfieImageBase64 }),
          timeoutMs: 30_000,
        },
      )
      const reference = `dojah-${randomUUID()}`
      if (status === 401 || status === 403) throw new ProviderError('dojah', status, 'unauthorized')
      // Dojah answers 400/404/424 when the number has no record.
      if (status === 400 || status === 404 || status === 424) {
        return {
          outcome: 'not_found',
          providerReference: reference,
          firstName: null,
          middleName: null,
          lastName: null,
          faceMatchScore: null,
          redacted: {},
        }
      }
      if (status < 200 || status >= 300 || !body?.entity) {
        throw new ProviderError('dojah', status, 'unexpected response')
      }

      const e = body.entity
      const selfie = (e.selfie_verification ?? {}) as {
        confidence_value?: unknown
        match?: unknown
      }
      const score = typeof selfie.confidence_value === 'number' ? selfie.confidence_value : null
      return {
        outcome: selfie.match === true ? 'verified' : 'selfie_mismatch',
        providerReference: reference,
        firstName: str(e.first_name ?? e.firstname),
        middleName: str(e.middle_name ?? e.middlename),
        lastName: str(e.last_name ?? e.surname),
        faceMatchScore: score,
        redacted: redact(e),
      }
    },
  }
}
