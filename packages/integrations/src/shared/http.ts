/**
 * A provider call that failed for reasons outside the user's control: network error, timeout,
 * 5xx or an unexpected response. Core maps it to a *_PROVIDER_UNAVAILABLE error. Messages never
 * include request bodies (they may hold BVNs, account numbers or keys).
 */
export class ProviderError extends Error {
  readonly provider: string
  readonly status: number | null

  constructor(provider: string, status: number | null, message: string) {
    super(`${provider}: ${message}`)
    this.name = 'ProviderError'
    this.provider = provider
    this.status = status
  }
}

export const isProviderError = (e: unknown): e is ProviderError => e instanceof ProviderError

/** JSON request with a timeout. Returns status + parsed body; throws ProviderError on network/5xx. */
export async function providerJson<T>(
  provider: string,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; body: T | null }> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 15_000) })
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'unreachable'
    throw new ProviderError(provider, null, reason)
  }
  if (res.status >= 500) throw new ProviderError(provider, res.status, `responded ${res.status}`)
  const body = (await res.json().catch(() => null)) as T | null
  return { status: res.status, body }
}
