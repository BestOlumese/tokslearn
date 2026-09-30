// Client helpers for buying from public pages (course page buttons, header cart badge, cart).
// Plain fetch against the REST API (/api/v1): the oRPC client would add ~15 KB to pages that sit
// at the edge of the JS budget (docs/12 §1, ADR-026). No server-only imports here.

export class ShopError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const OFFLINE = "We couldn't reach Tokslearn. Check your connection and try again."

/** Calls one REST procedure. Errors carry the server's code and its user-facing message. */
export async function shopApi<T>(
  path: `/${string}`,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  let res: Response
  try {
    const request: RequestInit = { method: init.method ?? 'GET', credentials: 'same-origin' }
    if (init.body !== undefined) {
      request.headers = { 'content-type': 'application/json' }
      request.body = JSON.stringify(init.body)
    }
    res = await fetch(`/api/v1${path}`, request)
  } catch {
    throw new ShopError('NETWORK', OFFLINE)
  }
  const data = (await res.json().catch(() => null)) as
    | (T & { message?: string; data?: { code?: string } })
    | null
  if (!res.ok) {
    throw new ShopError(data?.data?.code ?? 'INTERNAL', data?.message ?? OFFLINE)
  }
  return data as T
}

/** The non-secret hint set at sign-in (ADR-029): decides UI only, never access. */
export const isSignedIn = (): boolean =>
  typeof document !== 'undefined' && document.cookie.split('; ').includes('tl_signed_in=1')

/** `cohortId`: the start date picked for a cohort-based course. */
export type LocalItem = { itemType: 'course' | 'bundle'; itemId: string; cohortId?: string | null }

const KEY = 'tl_cart'
export const CART_EVENT = 'tl:cart'

/** A visitor's cart, kept in the browser until sign-in merges it (docs/20 `/cart`). */
export function readLocalCart(): LocalItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? (raw as LocalItem[]).slice(0, 20) : []
  } catch {
    return []
  }
}

export function writeLocalCart(items: LocalItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(items.slice(0, 20)))
  } catch {
    // Private mode or blocked storage: the cart lives for this page only.
  }
  cartChanged(items.length)
}

/** Adds an item, or switches its start date if it's already there. */
export function addLocal(item: LocalItem): void {
  writeLocalCart([...readLocalCart().filter((i) => i.itemId !== item.itemId), item])
}

/** Tells the header badge the new count. */
export function cartChanged(count: number): void {
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: count }))
}
