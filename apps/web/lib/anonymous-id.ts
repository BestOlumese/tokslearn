import 'server-only'

/** Browser id for attribution before sign-in (docs/08 §3). Random; carries nothing else. */
export const ANON_COOKIE = 'tl_aid'
export const ANON_MAX_AGE = 60 * 60 * 24 * 365

const VALID = /^[0-9a-f-]{36}$/

export const readAnonymousId = (value: string | undefined): string | null =>
  value && VALID.test(value) ? value : null
