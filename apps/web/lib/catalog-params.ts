import { CourseFiltersInput } from '@tokslearn/contract'
import type { Filters } from './catalog-data'

export type RawParams = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** URL search params → validated filters; bad values fall back to defaults (docs/20: filters in URL). */
export function parseFilters(raw: RawParams): Filters & { q: string } {
  const flat = Object.fromEntries(
    Object.entries(raw)
      .map(([k, v]) => [k, first(v)])
      .filter(([, v]) => v !== undefined && v !== ''),
  )
  const parsed = CourseFiltersInput.safeParse(flat)
  const f = parsed.success ? parsed.data : CourseFiltersInput.parse({})
  return {
    q: (first(raw.q) ?? '').trim().slice(0, 100),
    price: f.price,
    sort: f.sort,
    ...(f.level ? { level: f.level } : {}),
    ...(f.language ? { language: f.language } : {}),
    ...(f.minRating ? { minRating: f.minRating } : {}),
    ...(f.duration ? { duration: f.duration } : {}),
    ...(f.certificate ? { certificate: true } : {}),
    ...(f.cursor ? { cursor: f.cursor } : {}),
  }
}

/** Current params with some keys replaced or removed, as a query string. */
export function withParams(raw: RawParams, changes: Record<string, string | null>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(raw)) {
    const value = first(v)
    if (value) params.set(k, value)
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) params.delete(k)
    else params.set(k, v)
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}
