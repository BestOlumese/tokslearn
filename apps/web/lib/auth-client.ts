// Minimal Better Auth client for the auth pages: plain fetch to /api/auth/*, no SDK, so the
// sign-in pages stay inside the public JS budget (docs/12 §1). Everything else uses oRPC.

export interface AuthError {
  code: string
  message: string
  status: number
}

export type AuthResult<T> = { data: T; error: null } | { data: null; error: AuthError }

export async function authFetch<T>(path: string, body?: unknown): Promise<AuthResult<T>> {
  let res: Response
  try {
    res = await fetch(`/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
      credentials: 'include',
    })
  } catch {
    return {
      data: null,
      error: {
        code: 'NETWORK',
        status: 0,
        message: "We couldn't reach Tokslearn. Check your connection and try again.",
      },
    }
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (res.ok) return { data: (json ?? {}) as T, error: null }

  const code = typeof json?.code === 'string' ? json.code : `HTTP_${res.status}`
  const serverMessage = typeof json?.message === 'string' ? json.message : ''
  const retryAfter = Number(res.headers.get('x-retry-after') ?? res.headers.get('retry-after') ?? 0)
  const { describeAuthError } = await import('./auth-messages')
  return {
    data: null,
    error: {
      code,
      status: res.status,
      message: describeAuthError(code, res.status, serverMessage, retryAfter),
    },
  }
}

/** Only same-site relative paths; anything else goes home. Stops open redirects via ?next=. */
export function safeNext(raw: string | null | undefined, fallback = '/account'): string {
  if (!raw?.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}

export const readNext = (): string =>
  safeNext(new URLSearchParams(window.location.search).get('next'))
