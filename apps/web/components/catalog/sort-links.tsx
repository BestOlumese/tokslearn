import type { Route } from 'next'
import Link from 'next/link'
import { type RawParams, withParams } from '@/lib/catalog-params'

const sorts = [
  ['popular', 'Most learners'],
  ['newest', 'Newest'],
  ['rating', 'Highest rated'],
  ['price_low', 'Lowest price'],
  ['price_high', 'Highest price'],
] as const

/** Sort as links (no JS): the current one is marked for screen readers too. */
export function SortLinks({
  path,
  params,
  relevance = false,
}: {
  path: string
  params: RawParams
  relevance?: boolean
}) {
  const current =
    (Array.isArray(params.sort) ? params.sort[0] : params.sort) ?? (relevance ? '' : 'popular')
  const options: ReadonlyArray<readonly [string, string]> = relevance
    ? [['', 'Best match'], ...sorts]
    : sorts
  return (
    <nav
      aria-label="Sort courses"
      className="flex flex-wrap items-center gap-x-1 gap-y-1 text-body-sm"
    >
      <span className="mr-1 text-ink-2">Sort:</span>
      {options.map(([value, label]) => (
        <Link
          key={value || 'relevance'}
          href={`${path}${withParams(params, { sort: value || null, cursor: null })}` as Route}
          aria-current={current === value ? 'true' : undefined}
          className={
            current === value
              ? 'rounded-full bg-brand-soft px-3 py-1.5 font-medium text-brand-ink'
              : 'rounded-full px-3 py-1.5 text-ink-2 hover:bg-surface-sunken hover:text-ink'
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
