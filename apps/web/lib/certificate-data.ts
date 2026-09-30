import 'server-only'
import type { PublicCertificateDto } from '@tokslearn/contract'
import * as certificates from '@tokslearn/core/certificates'
import { anonymousActor, cacheTags, createCtx, DomainError } from '@tokslearn/core/kernel'
import { getDb } from '@tokslearn/db'
import { cacheLife, cacheTag } from 'next/cache'
import { baseProviders } from './providers'

// Cached certificate lookups for /verify/{code} (docs/10 §8). Same for every visitor; revoking,
// restoring or correcting the name invalidates `certificate:{code}` at once (lib/next-cache.ts).

const publicCtx = () =>
  createCtx({
    actor: anonymousActor,
    db: getDb(),
    requestId: 'public-cache',
    providers: baseProviders(),
  })

export async function getPublicCertificate(code: string): Promise<PublicCertificateDto | null> {
  'use cache'
  cacheTag(cacheTags.certificate(code))
  cacheLife('days')
  try {
    const c = await certificates.verifyCertificate(publicCtx(), code)
    return {
      ...c,
      issuedAt: c.issuedAt.toISOString(),
      revokedAt: c.revokedAt?.toISOString() ?? null,
    }
  } catch (error) {
    if (error instanceof DomainError && error.code === 'CERTIFICATE_NOT_FOUND') return null
    throw error
  }
}

/** Counts a verify-page view (runs after the response, outside the cache). */
export async function recordCertificateView(code: string): Promise<void> {
  await certificates.recordCertificateView(publicCtx(), code)
}

export const normaliseCertificateCode = certificates.normaliseCode
